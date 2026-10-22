import type {NotificationChannel,Platform} from './domain.ts';

export type NotificationEvent=
  |{kind:'JOB_FAILED';brandId:string;jobId:string;platform:Platform;title:string;errorCode:string;errorMessage:string}
  |{kind:'TOKEN_EXPIRING';brandId:string;socialAccountId:string;platform:Platform;expiresAt:number}
  |{kind:'ACCOUNT_EXPIRED';brandId:string;socialAccountId:string;platform:Platform}
  |{kind:'WEEKLY_REPORT';brandId:string;sections:{posts:{value:number;source:string;capturedAt:number};views:{value:number|null;source:string;capturedAt:number|null};followersDelta:{value:number|null;source:string;capturedAt:number|null};bestPost:{title:string;views:number;platform:Platform;source:string;capturedAt:number}|null;nextAction:string}};
export interface Notifier{send(channel:NotificationChannel,event:NotificationEvent):Promise<void>}

const names:Record<Platform,string>={FACEBOOK:'Facebook',INSTAGRAM:'Instagram',THREADS:'Threads',TIKTOK:'TikTok',YOUTUBE:'YouTube'};
export function renderVietnamese(event:NotificationEvent,appUrl:string):{subject:string;text:string}{
  const base=appUrl.replace(/\/$/,'');
  if(event.kind==='JOB_FAILED')return{subject:`DSM: đăng ${names[event.platform]} thất bại`,text:`Bài: ${event.title}\nNền tảng: ${names[event.platform]}\nMã lỗi: ${event.errorCode}\nChi tiết: ${event.errorMessage}\nXem lịch: ${base}/app/brands/${encodeURIComponent(event.brandId)}/calendar`};
  if(event.kind==='TOKEN_EXPIRING')return{subject:`DSM: kết nối ${names[event.platform]} sắp hết hạn`,text:`Tài khoản ${names[event.platform]} ${event.socialAccountId} sắp hết hạn vào ${new Date(event.expiresAt).toLocaleString('vi-VN')}.\nKiểm tra: ${base}/app/brands/${encodeURIComponent(event.brandId)}/accounts`};
  if(event.kind==='WEEKLY_REPORT'){const s=event.sections;return{subject:'DSM: báo cáo tăng trưởng tuần',text:`Báo cáo tuần\nSố bài: ${s.posts.value}\nLượt xem: ${s.views.value??'Chưa đủ dữ liệu'}\nNgười theo dõi tăng/giảm: ${s.followersDelta.value??'Chưa đủ dữ liệu'}\nBài tốt nhất: ${s.bestPost?`${s.bestPost.title} (${names[s.bestPost.platform]}, ${s.bestPost.views} lượt xem)`:'Chưa có bài đủ dữ liệu'}\nViệc nên làm: ${s.nextAction}\nXem dashboard: ${base}/app/brands/${encodeURIComponent(event.brandId)}/growth`}}
  return{subject:`DSM: kết nối ${names[event.platform]} đã hết hạn`,text:`Tài khoản ${names[event.platform]} ${event.socialAccountId} đã hết hạn.\nKết nối lại: ${base}/app/brands/${encodeURIComponent(event.brandId)}/accounts`};
}
