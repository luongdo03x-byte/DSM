import {spawn} from 'node:child_process';

interface ProbeResult {streams?: Array<{codec_type?:string;codec_name?:string;width?:number;height?:number;duration?:string}>;format?:{duration?:string}}

export async function probeVideo(filePath:string):Promise<{durationMs:number;width:number;height:number;codec:string}> {
  const output = await new Promise<string>((resolve, reject) => {
    const child = spawn('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', filePath], {windowsHide:true});
    let stdout = '', stderr = '';
    const timeout = setTimeout(() => child.kill(), 15_000);
    child.stdout.setEncoding('utf8').on('data', (chunk:string) => {stdout += chunk;});
    child.stderr.setEncoding('utf8').on('data', (chunk:string) => {stderr += chunk;});
    child.on('error', error => {clearTimeout(timeout); reject(error);});
    child.on('close', code => {clearTimeout(timeout); if (code === 0) resolve(stdout); else reject(new Error(`ffprobe failed (${code}): ${stderr}`));});
  });
  const data = JSON.parse(output) as ProbeResult;
  const video = data.streams?.find(stream => stream.codec_type === 'video');
  const duration = Number(video?.duration ?? data.format?.duration);
  if (!video?.width || !video.height || !video.codec_name || !Number.isFinite(duration)) throw new Error('Invalid ffprobe video result');
  return {durationMs:Math.round(duration * 1000),width:video.width,height:video.height,codec:video.codec_name};
}
