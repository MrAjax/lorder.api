import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { ListResponseDto, PaginationDto } from '../../@common/dto';
import { ValidationException } from '../../@common/exceptions/validation.exception';
import { Project } from '../../@orm/project';
import { ProjectTaskTypeRepository } from '../../@orm/project-task-type';
import { Task, TaskRepository } from '../../@orm/task';
import { TaskTypeRepository } from '../../@orm/task-type';
import { User, UserRepository } from '../../@orm/user';
import { ACCESS_LEVEL, UserProjectRepository } from '../../@orm/user-project';
import { TaskService } from '../../task/task.service';
import { TaskCreateDto, TaskMoveDto, TaskUpdateDto } from './dto';
import { ProjectTaskGateway } from './project.task.gateway';

@Injectable()
export class ProjectTaskService {
  constructor(
    // TODO: remove taskRepo from this file and use taskService instead!!!
    @InjectRepository(TaskRepository) private readonly taskRepo: TaskRepository,
    @InjectRepository(UserRepository) private readonly userRepo: UserRepository,
    @InjectRepository(UserProjectRepository)
    private readonly userProjectRepo: UserProjectRepository,
    @InjectRepository(TaskTypeRepository) private readonly taskTypeRepo: TaskTypeRepository,
    @InjectRepository(ProjectTaskTypeRepository)
    private readonly projectTaskTypeRepo: ProjectTaskTypeRepository,
    private readonly taskGateway: ProjectTaskGateway,
    private readonly taskService: TaskService
  ) {}

  public async findAll(pagesDto: PaginationDto, projectId: number): Promise<ListResponseDto<Task>> {
    const [list, total] = await this.taskRepo.findAllByProjectId(pagesDto, projectId);
    return { list, total };
  }

  public findOne(sequenceNumber: number, projectId: number): Promise<Task> {
    return this.taskRepo.findOneByProjectId(sequenceNumber, projectId);
  }

  public async create(taskCreateDto: TaskCreateDto, project: Project, user: User): Promise<Task> {
    const preparedData = await this.parseTaskDtoToTaskObj(taskCreateDto, project.id);
    return await this.taskService.createByProject(preparedData, project, user);
  }

  public async update(
    sequenceNumber: number,
    taskUpdateDto: TaskUpdateDto,
    project: Project,
    user: User
  ): Promise<Task> {
    // 1. Проверить соответсвие проекта задаче и уровень доступа пользователя к проекту
    const checkedTask = await this.checkAccess(sequenceNumber, project, user, ACCESS_LEVEL.YELLOW);
    // 2. Подготовить данные для обновления задачи
    const preparedData = await this.parseTaskDtoToTaskObj(taskUpdateDto, project.id);
    // 3. Обновить задачу
    const updatedTask = await this.taskService.updateByUser(checkedTask, preparedData, user);
    // 4. Отправить всем пользователям обновленные данные задачи
    this.taskGateway.updateTaskForAll(updatedTask);
    // 5. Вернуть измененную задачу
    return updatedTask;
  }

  public async move(
    sequenceNumber: number,
    project: Project,
    user: User,
    taskMoveDto: TaskMoveDto
  ): Promise<Task> {
    // 1. Проверить соответсвие проекта задаче и уровень доступа пользователя к проекту
    const checkedTask = await this.checkAccess(sequenceNumber, project, user);
    // 2. TODO: проверить разрешенное перемещение задачи для данного статуса
    // 3. TODO: проверить разрешенное перемещение задачи для данного пользователя
    // 4. Обновить и вернуть обновленную задачу
    return this.taskService.updateByUser(checkedTask, taskMoveDto, user);
  }

  public async delete(sequenceNumber: number, projectId: number): Promise<Task | false> {
    const task = await this.findOne(sequenceNumber, projectId);
    if (!task) {
      return false;
    }
    await this.taskRepo.delete({ sequenceNumber, project: { id: projectId } });
    return task;
  }

  public async checkAccess(
    sequenceNumber: number,
    project: Project,
    user: User,
    statusLevel: ACCESS_LEVEL = ACCESS_LEVEL.RED
  ): Promise<Task> {
    const checkedTask = await this.taskService.findOne(sequenceNumber, project, user);
    if (project.accessLevel.accessLevel < statusLevel) {
      if (checkedTask.performerId !== user.id) {
        throw new ForbiddenException({
          message: 'У вас нет доступа к редактированию этой задачи',
          task: checkedTask,
        });
      }
    }
    return checkedTask;
  }

  private async parseTaskDtoToTaskObj(
    taskDto: TaskCreateDto | TaskUpdateDto,
    projectId: number
  ): Promise<Partial<Task>> {
    const preparedData: Partial<Task> = {};
    if (taskDto.description !== undefined) {
      preparedData.description = taskDto.description;
    }
    if (taskDto.title !== undefined) {
      preparedData.title = taskDto.title;
    }
    if (taskDto.value !== undefined) {
      preparedData.value = taskDto.value;
    }
    if (taskDto.source !== undefined) {
      preparedData.source = taskDto.source;
    }
    if (taskDto.status !== undefined) {
      preparedData.status = taskDto.status;
    }
    if (taskDto.typeId !== undefined) {
      if (!taskDto.typeId) {
        preparedData.typeId = null;
      } else {
        const projectTaskType = await this.projectTaskTypeRepo.findOne({
          where: {
            project: { id: projectId },
            taskType: { id: taskDto.typeId },
          },
        });
        if (!projectTaskType) {
          throw new ValidationException(undefined, 'Тип задачи не был найдет в текущем проекте');
        }
        preparedData.type = projectTaskType.taskType;
      }
      preparedData.typeId = taskDto.typeId;
    }
    if (taskDto.performerId !== undefined) {
      if (!taskDto.performerId) {
        preparedData.performer = null;
      } else {
        const performer = await this.userProjectRepo.findOne({
          relations: ['member'],
          where: {
            member: { id: taskDto.performerId },
            project: { id: projectId },
          },
        });
        if (!performer) {
          throw new ValidationException(undefined, 'Исполнитель не был найдет в текущем проекте');
        }
        preparedData.performer = performer.member;
      }
    }

    if (taskDto.users && taskDto.users.length) {
      preparedData.users = await this.userRepo.findAllByIds(taskDto.users);
      if (taskDto.users.length !== preparedData.users.length) {
        throw new ValidationException(undefined, 'Не все пльзователи были найдены');
      }
    }
    return preparedData;
  }
}
