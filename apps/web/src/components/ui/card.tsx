import type {HTMLAttributes,ReactNode} from 'react';

export function Card({children,className='',...props}:HTMLAttributes<HTMLDivElement>&{children:ReactNode}){
  return <section className={`ui-card ${className}`.trim()} {...props}>{children}</section>;
}
