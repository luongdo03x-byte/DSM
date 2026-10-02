import type {ContentType,Platform,PublishStrategy} from '../../shared/src/domain.ts';
export type PublishErrorType='VALIDATION_ERROR'|'AUTH_ERROR'|'RATE_LIMIT'|'PLATFORM_ERROR'|'NETWORK_ERROR'|'BROWSER_ERROR'|'UNSUPPORTED_CAPABILITY'|'UNKNOWN';
export class PublishError extends Error{type:PublishErrorType;code:string;retryable:boolean;retryAfterMs?:number;constructor(input:{type:PublishErrorType;code:string;message:string;retryable:boolean;retryAfterMs?:number|undefined}){super(input.message);this.type=input.type;this.code=input.code;this.retryable=input.retryable;if(input.retryAfterMs!==undefined)this.retryAfterMs=input.retryAfterMs}}
export interface PublishInput{brandId:string;socialAccountId:string;contentVariantId:string;platform:Platform;contentType:ContentType;caption?:string|undefined;body?:string|undefined;mediaUrl?:string|undefined;remoteCorrelationId?:string|undefined;metadata?:Record<string,unknown>|undefined}
export interface ValidationResult{valid:boolean;errors:string[];warnings:string[]}
export interface PublishResult{externalPostId?:string|undefined;externalUrl?:string|undefined;remoteCorrelationId?:string|undefined;publishedAt?:number|undefined;processing?:boolean|undefined}
export interface PublishedPostData{externalPostId:string;externalUrl?:string|undefined;publishedAt?:number|undefined;exists:boolean}
export interface PostMetricsData{views?:number|undefined;likes?:number|undefined;comments?:number|undefined;shares?:number|undefined;saves?:number|undefined;raw:Record<string,unknown>}
export interface PlatformPublisher{validate(input:PublishInput):Promise<ValidationResult>;publish(input:PublishInput):Promise<PublishResult>;fetchPost(postId:string,context?:{socialAccountId?:string}):Promise<PublishedPostData>;fetchMetrics(postId:string,context?:{socialAccountId?:string}):Promise<PostMetricsData>}
export interface PlatformCapability{platform:Platform;contentType:ContentType;strategy:PublishStrategy;supported:boolean}
