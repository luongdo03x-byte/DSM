import type {ReactNode} from 'react';

export function Badge({tone='neutral',children}:{tone?:'neutral'|'success'|'warning'|'danger'|'info';children:ReactNode}){
  return <span className={`ui-badge ui-badge--${tone}`}>{children}</span>;
}
