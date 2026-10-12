import {Card} from './card.tsx';

export function StatCard({label,value,detail}:{label:string;value:string|number;detail?:string}){
  return <Card className="stat-card">
    <span className="stat-card__label">{label}</span>
    <strong className="stat-card__value">{value}</strong>
    {detail?<span className="stat-card__detail">{detail}</span>:null}
  </Card>;
}
