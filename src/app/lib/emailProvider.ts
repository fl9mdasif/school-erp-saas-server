import { env } from '../config/env';
import { logger } from './logger';

export interface EmailProvider {
  send(to: string, subject: string, body: string): Promise<void>;
}

/** No email vendor is connected. Development logs the message (never the address); production only warns. */
class ConsoleEmailProvider implements EmailProvider {
  async send(_to: string, subject: string, body: string) {
    if (env.isProd) logger.warn({ subject }, 'email not sent: no email provider configured');
    else logger.info({ subject, body }, 'email (dev console provider)');
  }
}

let provider: EmailProvider = new ConsoleEmailProvider();
export const getEmailProvider = () => provider;
export const setEmailProvider = (p: EmailProvider) => {
  provider = p;
};
