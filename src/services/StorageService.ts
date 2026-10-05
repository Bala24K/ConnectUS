import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';
import { IAttachmentRepository } from '../repositories/interfaces';
import { Attachment } from '../types/domain';
import { logger } from '../observability/logger';

export class StorageService {
  private uploadsDir: string;

  constructor(private attachmentRepo: IAttachmentRepository) {
    this.uploadsDir = path.join(process.cwd(), 'public', 'uploads');
    if (!fs.existsSync(this.uploadsDir)) {
      try {
        fs.mkdirSync(this.uploadsDir, { recursive: true });
      } catch (err) {
        logger.warn({ err }, 'Failed to create uploads directory');
      }
    }
  }

  async saveBase64Media(
    uploaderId: string,
    dataUrl: string,
    mimeType: string,
    messageId?: string
  ): Promise<Attachment> {
    const matches = dataUrl.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
    let buffer: Buffer;
    let effectiveMime = mimeType;

    if (matches && matches.length === 3) {
      effectiveMime = matches[1];
      buffer = Buffer.from(matches[2], 'base64');
    } else {
      buffer = Buffer.from(dataUrl, 'base64');
    }

    const ext = effectiveMime.split('/')[1] || 'bin';
    const id = `att_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    const fileName = `${id}.${ext}`;
    const filePath = path.join(this.uploadsDir, fileName);

    fs.writeFileSync(filePath, buffer);

    const storageUrl = `/uploads/${fileName}`;
    return this.attachmentRepo.create({
      id,
      messageId,
      uploaderId,
      fileName,
      mimeType: effectiveMime,
      fileSize: buffer.length,
      storageUrl,
    });
  }

  async getAttachment(id: string): Promise<Attachment | null> {
    return this.attachmentRepo.findById(id);
  }
}
