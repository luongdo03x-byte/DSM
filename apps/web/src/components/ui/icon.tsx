const glyphs:Record<string,string>={
  home:'⌂',box:'▣',edit:'✎',calendar:'□',target:'◎',users:'♙',chart:'▥',settings:'⚙',menu:'☰'
};
export function Icon({name,label}:{name:string;label?:string}){
  return <span className="ui-icon" aria-hidden={label?undefined:true} aria-label={label}>{glyphs[name]??'•'}</span>;
}
