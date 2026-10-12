import {Badge} from './badge.tsx';
import {platformLabel} from '../../lib/ui/status.ts';

export function PlatformBadge({platform}:{platform:string}){
  return <Badge tone="info">{platformLabel(platform)}</Badge>;
}
