import type {ButtonHTMLAttributes,ReactNode} from 'react';
type Props=Omit<ButtonHTMLAttributes<HTMLButtonElement>,'size'>&{variant?:'primary'|'secondary'|'ghost'|'danger';size?:'sm'|'md';children:ReactNode};
export function Button({variant='primary',size='md',className='',children,...props}:Props){return <button className={('ui-button ui-button--'+variant+(size==='sm'?' ui-button--sm':'')+' '+className).trim()} {...props}>{children}</button>}
