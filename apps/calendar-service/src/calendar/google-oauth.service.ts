import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { google, Auth } from 'googleapis';

import { GoogleToken, GoogleTokenDocument } from './schemas/google-token.schema';

@Injectable()
export class GoogleOAuthService {
  private readonly logger = new Logger(GoogleOAuthService.name);
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;

  constructor(
    private readonly config: ConfigService,
    @InjectModel(GoogleToken.name)
    private readonly tokenModel: Model<GoogleTokenDocument>,
  ) {
    this.clientId = this.config.getOrThrow<string>('GOOGLE_CLIENT_ID');
    this.clientSecret = this.config.getOrThrow<string>('GOOGLE_CLIENT_SECRET');
    this.redirectUri = this.config.getOrThrow<string>('GOOGLE_REDIRECT_URI');
  }

  /** Create a fresh OAuth2 client (no tokens attached) */
  createOAuthClient(): Auth.OAuth2Client {
    return new google.auth.OAuth2(
      this.clientId,
      this.clientSecret,
      this.redirectUri,
    );
  }

  /** Generate the Google consent-screen URL */
  getAuthUrl(): string {
    const client = this.createOAuthClient();
    return client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',            // always return a refresh_token
      scope: [
        'https://www.googleapis.com/auth/calendar.events',
        'https://www.googleapis.com/auth/userinfo.email',
      ],
    });
  }

  /**
   * Exchange the authorization code for tokens, look up the Google account
   * e-mail, and persist (upsert) the tokens for this SnapSalon user.
   */
  async handleCallback(code: string, userId: string): Promise<string> {
    const client = this.createOAuthClient();
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);

    // Resolve the Google account e-mail
    const oauth2 = google.oauth2({ version: 'v2', auth: client });
    const { data } = await oauth2.userinfo.get();
    const googleEmail = data.email ?? 'unknown';

    await this.tokenModel.findOneAndUpdate(
      { userId },
      {
        userId,
        googleEmail,
        accessToken: tokens.access_token ?? '',
        refreshToken: tokens.refresh_token ?? '',
        expiryDate: tokens.expiry_date ?? Date.now() + 3600 * 1000,
      },
      { upsert: true, new: true },
    );

    this.logger.log(`Google Calendar connected for userId=${userId} (${googleEmail})`);
    return googleEmail;
  }

  /**
   * Return an OAuth2 client with valid credentials for a given user.
   * Automatically refreshes the access token if it has expired.
   * Returns null if the user has not connected Google Calendar.
   */
  async getAuthorizedClient(userId: string): Promise<Auth.OAuth2Client | null> {
    const record = await this.tokenModel.findOne({ userId }).lean().exec();
    if (!record) return null;

    const client = this.createOAuthClient();
    client.setCredentials({
      access_token: record.accessToken,
      refresh_token: record.refreshToken,
      expiry_date: record.expiryDate,
    });

    // Refresh proactively when the token expires within the next 5 minutes
    if (record.expiryDate < Date.now() + 5 * 60 * 1000) {
      const { credentials } = await client.refreshAccessToken();
      client.setCredentials(credentials);

      await this.tokenModel.updateOne(
        { userId },
        {
          accessToken: credentials.access_token ?? '',
          expiryDate: credentials.expiry_date ?? Date.now() + 3600 * 1000,
        },
      );
    }

    return client;
  }

  /** Check whether a user has connected their Google Calendar */
  async isConnected(userId: string): Promise<boolean> {
    const count = await this.tokenModel.countDocuments({ userId });
    return count > 0;
  }

  /** Remove stored tokens (disconnect) */
  async disconnect(userId: string): Promise<void> {
    await this.tokenModel.deleteOne({ userId });
  }
}
