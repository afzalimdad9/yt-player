import {
  S3Client,
  S3ClientConfig,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  HeadObjectCommand,
  CreateBucketCommand,
  _Object,
} from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { Readable } from 'node:stream'

export interface StorageConfig {
  endpoint: string
  accessKey: string
  secretKey: string
  region: string
  bucket: string
  publicUrl: string
}

/** Default config reads from environment variables */
export function getDefaultConfig(): StorageConfig {
  return {
    endpoint: process.env['STORAGE_ENDPOINT'] || 'http://localhost:9000',
    accessKey: process.env['STORAGE_ACCESS_KEY'] || 'minioadmin',
    secretKey: process.env['STORAGE_SECRET_KEY'] || 'minioadmin',
    region: process.env['STORAGE_REGION'] || 'us-east-1',
    bucket: process.env['STORAGE_BUCKET'] || 'yt-player',
    publicUrl: process.env['STORAGE_PUBLIC_URL'] || 'http://localhost:9000/yt-player',
  }
}

export class StorageClient {
  private client: S3Client
  private config: StorageConfig

  constructor(config?: Partial<StorageConfig>) {
    this.config = { ...getDefaultConfig(), ...config }

    const s3Config: S3ClientConfig = {
      region: this.config.region,
      credentials: {
        accessKeyId: this.config.accessKey,
        secretAccessKey: this.config.secretKey,
      },
      forcePathStyle: true, // Required for MinIO
    }

    // Only set endpoint for non-AWS S3 (MinIO, etc.)
    if (!this.config.endpoint.includes('amazonaws.com')) {
      s3Config.endpoint = this.config.endpoint
    }

    this.client = new S3Client(s3Config)
  }

  /** Ensure the bucket exists; create if not */
  async ensureBucket(): Promise<void> {
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.config.bucket, Key: '.bucket-init' })
      )
    } catch {
      await this.client.send(
        new CreateBucketCommand({ Bucket: this.config.bucket })
      )
    }
  }

  /** Upload a file to storage */
  async upload(
    key: string,
    body: Buffer | Readable | string | Uint8Array,
    contentType?: string,
    metadata?: Record<string, string>
  ): Promise<string> {
    const upload = new Upload({
      client: this.client,
      params: {
        Bucket: this.config.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        Metadata: metadata,
      },
    })

    await upload.done()
    return this.getPublicUrl(key)
  }

  /** Download a file from storage */
  async download(key: string): Promise<Readable> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
      })
    )
    return response.Body as Readable
 }

  /** Delete a file from storage */
  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
      })
    )
  }

  /** List files with a given prefix */
  async list(prefix: string): Promise<_Object[]> {
    const response = await this.client.send(
      new ListObjectsV2Command({
        Bucket: this.config.bucket,
        Prefix: prefix,
      })
    )
    return response.Contents || []
  }

  /** Generate a pre-signed URL for temporary access */
  async getPresignedUrl(
    key: string,
    expiresInSeconds = 3600
  ): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.config.bucket,
      Key: key,
    })
    return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds })
  }

  /** Get the public URL for a key */
  getPublicUrl(key: string): string {
    return `${this.config.publicUrl}/${key}`
  }

  /** Get the bucket name */
  get bucket(): string {
    return this.config.bucket
  }
}
