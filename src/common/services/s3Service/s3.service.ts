import { DeleteObjectCommand, DeleteObjectsCommand, GetObjectCommand, ListObjectsV2Command, ObjectCannedACL, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";
import fs from 'node:fs';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { StoreEnum } from "src/common/enums/multerEnum";
import { BadRequestException, Injectable } from "@nestjs/common";

@Injectable()
export class S3Service {
    private client: S3Client;

    constructor() {
        this.client = new S3Client({
            region: process.env.AWS_REGION!,
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY!,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!
            }
        });
    }

    async uploadFile({
        ACL = ObjectCannedACL.private,
        path = "General",
        file,
        store_type = StoreEnum.memory
    }: {
        ACL?: ObjectCannedACL;
        path?: string;
        file: Express.Multer.File;
        store_type?: StoreEnum;
    }): Promise<string> {
        if (!file) {
            throw new BadRequestException("No file provided for upload");
        }

        const fileName = file.filename || file.originalname || 'file';
        const key = `${process.env.AWS_APP_NAME || 'app'}/${path}/${randomUUID()}_${fileName}`;

        const command = new PutObjectCommand({
            Bucket: process.env.AWS_BUCKET_NAME,
            ACL,
            Key: key,
            Body: store_type === StoreEnum.memory ? file.buffer : fs.createReadStream(file.path),
            ContentType: file.mimetype
        });

        try {
            await this.client.send(command);
            return key;
        } catch {
            throw new BadRequestException("Failed to upload file to storage.");
        }
    }

    async uploadLargeFile({
        ACL = ObjectCannedACL.private,
        path = "General",
        file,
        store_type = StoreEnum.disk
    }: {
        ACL?: ObjectCannedACL;
        path?: string;
        file: Express.Multer.File;
        store_type?: StoreEnum;
    }): Promise<string> {
        if (!file) {
            throw new BadRequestException("No file provided for upload");
        }

        const fileName = file.filename || file.originalname || 'file';
        const key = `${process.env.AWS_APP_NAME || 'app'}/${path}/${randomUUID()}_${fileName}`;

        const command = new Upload({
            client: this.client,
            params: {
                Bucket: process.env.AWS_BUCKET_NAME,
                ACL,
                Key: key,
                Body: store_type === StoreEnum.memory ? file.buffer : fs.createReadStream(file.path),
                ContentType: file.mimetype
            }
        });

        try {
            const res = await command.done();
            return res.Key || key;
        } catch {
            throw new BadRequestException("Failed to upload large file to storage.");
        }
    }

    async uploadFiles({
        ACL = ObjectCannedACL.private,
        path = "General",
        files,
        store_type = StoreEnum.memory,
        isLarge = false
    }: {
        ACL?: ObjectCannedACL;
        path?: string;
        files: Express.Multer.File[];
        store_type?: StoreEnum;
        isLarge?: boolean;
    }): Promise<string[]> {
        if (!files || files.length === 0) return [];

        const uploadedKeys: string[] = [];

        try {
            for (const file of files) {
                const key = isLarge
                    ? await this.uploadLargeFile({ ACL, path, store_type, file })
                    : await this.uploadFile({ ACL, path, store_type, file });
                uploadedKeys.push(key);
            }
            return uploadedKeys;
        } catch (error) {
            if (uploadedKeys.length > 0) {
                await this.deleteManyFiles(uploadedKeys).catch(() => {});
            }
            throw error;
        }
    }

    async getFile(Key: string) {
        const command = new GetObjectCommand({
            Bucket: process.env.AWS_BUCKET_NAME,
            Key
        });
        return await this.client.send(command);
    }

    async getManyFiles(folderName: string) {
        const command = new ListObjectsV2Command({
            Bucket: process.env.AWS_BUCKET_NAME,
            Prefix: `${process.env.AWS_APP_NAME || 'app'}/users/${folderName}`
        });
        return await this.client.send(command);
    }

    async createPreSignedUrl({
        path = "General",
        fileName,
        ContentType,
        expiresIn = 60 * 10
    }: {
        path?: string;
        fileName: string;
        ContentType: string;
        expiresIn?: number;
    }) {
        const Key = `${process.env.AWS_APP_NAME || 'app'}/${path}/${randomUUID()}_${fileName}`;
        const command = new PutObjectCommand({
            Bucket: process.env.AWS_BUCKET_NAME,
            Key,
            ContentType
        });

        const url = await getSignedUrl(this.client, command, { expiresIn });
        return { url, Key };
    }

    async getPreSignedUrl({
        Key = "General",
        expiresIn = 60 * 10,
        download = "true"
    }: {
        Key: string;
        expiresIn?: number;
        download?: string | undefined;
    }) {
        const command = new GetObjectCommand({
            Bucket: process.env.AWS_BUCKET_NAME,
            Key,
            ResponseContentDisposition: download === "true" ? `attachment; filename="${Key.split("/").pop()}"` : undefined
        });

        const url = await getSignedUrl(this.client, command, { expiresIn });
        return { url };
    }

    async deleteFile(Key: string) {
        if (!Key) return;
        const command = new DeleteObjectCommand({
            Bucket: process.env.AWS_BUCKET_NAME,
            Key
        });
        return await this.client.send(command);
    }

    async deleteManyFiles(Keys: string[]) {
        if (!Keys || Keys.length === 0) return;
        const mappedKey = Keys.map((k) => ({ Key: k }));
        const command = new DeleteObjectsCommand({
            Bucket: process.env.AWS_BUCKET_NAME,
            Delete: { Objects: mappedKey }
        });
        return await this.client.send(command);
    }
}

