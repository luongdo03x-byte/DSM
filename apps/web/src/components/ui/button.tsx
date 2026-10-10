import type {ButtonHTMLAttributes,ReactNode} from 'react';

type Props=ButtonHTMLAttributes<HTMLButtonElement>&{
  variant?:'primary'|'secondary'|'ghost'|'danger';
  children:ReactNode;
};

export function Button({variant='primary',className='',children,...props}:Props){
  return <button className={`ui-button ui-button--${variant} ${className}`.trim()} {...props}>{children}</button>;
}
