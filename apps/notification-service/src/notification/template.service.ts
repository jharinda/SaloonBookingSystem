import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  NotificationTemplate,
  NotificationTemplateDocument,
} from './schemas/notification-template.schema';
import {
  NotificationLog,
  NotificationLogDocument,
  NotificationStatus,
} from './schemas/notification-log.schema';
import {
  NotificationChannel,
  TemplateType,
} from './constants/notification-events.constants';

export interface TemplateVariables {
  clientName?: string;
  salonName?: string;
  serviceName?: string;
  date?: string;
  time?: string;
  address?: string;
  totalPrice?: string;
  reason?: string;
  [key: string]: string | undefined;
}

@Injectable()
export class TemplateService {
  private readonly logger = new Logger(TemplateService.name);

  constructor(
    @InjectModel(NotificationTemplate.name)
    private readonly templateModel: Model<NotificationTemplateDocument>,
    @InjectModel(NotificationLog.name)
    private readonly logModel: Model<NotificationLogDocument>,
  ) {}

  /**
   * Resolve a template by type + channel and render it with the given variables.
   * Uses Handlebars-style replacement: {{variableName}}
   */
  async render(
    type: TemplateType,
    channel: NotificationChannel,
    variables: TemplateVariables,
  ): Promise<{ subject: string; body: string }> {
    const template = await this.templateModel
      .findOne({ type, channel, active: true })
      .lean()
      .exec();

    if (!template) {
      throw new NotFoundException(
        `No active template found for type=${type} channel=${channel}`,
      );
    }

    return {
      subject: this.interpolate(template.subject, variables),
      body: this.interpolate(template.body, variables),
    };
  }

  async logNotification(entry: {
    templateType: TemplateType;
    channel: NotificationChannel;
    recipient: string;
    status: NotificationStatus;
    providerMessageId: string | null;
    error: string | null;
    bookingId: string;
  }): Promise<void> {
    try {
      await this.logModel.create(entry);
    } catch (err: unknown) {
      // Logging failures must never block the main flow
      this.logger.warn(`Failed to write notification log: ${String(err)}`);
    }
  }

  /** Replace all {{key}} occurrences with their values */
  private interpolate(text: string, vars: TemplateVariables): string {
    return text.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? '');
  }
}
