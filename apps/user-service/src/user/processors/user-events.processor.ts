import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';
import { Logger } from '@nestjs/common';
import { UserService } from '../user.service';
import { CreateUserProfileDto } from '../dto/user-profile.dto';

export const USER_EVENTS_QUEUE = 'user-events';

export interface UserCreatedEvent {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
}

@Processor(USER_EVENTS_QUEUE)
export class UserEventsProcessor {
  private readonly logger = new Logger(UserEventsProcessor.name);

  constructor(private readonly userService: UserService) {}

  @Process('user.created')
  async handleUserCreated(job: Job<UserCreatedEvent>) {
    this.logger.log(`Processing user.created event for userId: ${job.data.userId}`);

    try {
      const dto: CreateUserProfileDto = {
        userId: job.data.userId,
        email: job.data.email,
        firstName: job.data.firstName,
        lastName: job.data.lastName,
        role: job.data.role,
      };

      await this.userService.createUserProfile(dto);
      this.logger.log(`Successfully created user profile for userId: ${job.data.userId}`);
    } catch (error) {
      this.logger.error(
        `Failed to create user profile for userId: ${job.data.userId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }

  @Process('user.updated')
  async handleUserUpdated(job: Job<{ userId: string; email?: string; firstName?: string; lastName?: string; avatarUrl?: string }>) {
    this.logger.log(`Processing user.updated event for userId: ${job.data.userId}`);

    try {
      const updateData: Partial<{ email: string; firstName: string; lastName: string }> = {};
      if (job.data.email) updateData.email = job.data.email;
      if (job.data.firstName) updateData.firstName = job.data.firstName;
      if (job.data.lastName) updateData.lastName = job.data.lastName;

      if (Object.keys(updateData).length > 0) {
        await this.userService.updateProfile(job.data.userId, updateData);
      }

      if (job.data.avatarUrl) {
        await this.userService.setAvatarUrl(job.data.userId, job.data.avatarUrl);
      }

      this.logger.log(`Successfully updated user profile for userId: ${job.data.userId}`);
    } catch (error) {
      this.logger.error(
        `Failed to update user profile for userId: ${job.data.userId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }

  @Process('user.deleted')
  async handleUserDeleted(job: Job<{ userId: string }>) {
    this.logger.log(`Processing user.deleted event for userId: ${job.data.userId}`);

    try {
      await this.userService.deleteProfile(job.data.userId);
      this.logger.log(`Successfully deleted user profile for userId: ${job.data.userId}`);
    } catch (error) {
      this.logger.error(
        `Failed to delete user profile for userId: ${job.data.userId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }
}
