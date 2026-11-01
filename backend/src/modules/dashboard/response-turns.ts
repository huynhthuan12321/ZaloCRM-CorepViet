/** Report-only pairing. Does not send messages or modify conversation state. */
export interface ResponseEvent {
  id:string;conversationId:string;sentAt:Date;senderType:string;sentVia:string;
  repliedByUserId:string|null;isLocal?:boolean;isDeleted?:boolean;dryRun?:boolean;
}
export interface ResponsePair {conversationId:string;incomingId:string;replyId:string;lastInboundAt:Date;replyAt:Date;userId:string;seconds:number;}

export function pairCustomerResponses(events:ResponseEvent[],start:Date,end:Date,asOf:Date){
  const waiting=new Map<string,ResponseEvent>();
  const pairs:ResponsePair[]=[];
  let unattributed=0;
  const sorted=events.filter(e=>!e.isLocal&&!e.isDeleted&&!e.dryRun&&e.sentAt<=asOf)
    .slice().sort((a,b)=>a.sentAt.getTime()-b.sentAt.getTime()||a.id.localeCompare(b.id));
  for(const event of sorted){
    if(event.senderType==='contact'){waiting.set(event.conversationId,event);continue;}
    if(event.senderType!=='self'||!['user','user_native'].includes(event.sentVia))continue;
    const inbound=waiting.get(event.conversationId);if(!inbound)continue;
    // A human response closes the turn even if the actor cannot be attributed.
    waiting.delete(event.conversationId);
    if(inbound.sentAt<start||inbound.sentAt>=end)continue;
    if(!event.repliedByUserId){unattributed++;continue;}
    pairs.push({conversationId:event.conversationId,incomingId:inbound.id,replyId:event.id,lastInboundAt:inbound.sentAt,replyAt:event.sentAt,userId:event.repliedByUserId,seconds:(event.sentAt.getTime()-inbound.sentAt.getTime())/1000});
  }
  const pending=[...waiting.values()].filter(e=>e.sentAt>=start&&e.sentAt<end).length;
  return {pairs,pending,unattributed};
}
