// AfterStack is a new, restricted card-stack format, not a HyperCard emulator.
export function validateStack(stack) {
  const errors=[];
  if(!stack || typeof stack !== 'object' || Array.isArray(stack)) return ['Stack must be an object.'];
  if(typeof stack.title!=='string' || !stack.title.trim()) errors.push('A title is required.');
  if(!Array.isArray(stack.cards) || stack.cards.length<1 || stack.cards.length>100) return [...errors,'Use 1–100 cards.'];
  const ids=new Set();
  for(const c of stack.cards){
    if(typeof c.id!=='string' || !/^[a-z0-9_-]{1,40}$/i.test(c.id)) errors.push('Card ids use letters, numbers, _ or -.');
    if(ids.has(c.id)) errors.push(`Duplicate card: ${c.id}`); ids.add(c.id);
    if(typeof c.title!=='string'||typeof c.body!=='string') errors.push(`Card ${c.id} needs a title and body.`);
    if(!Array.isArray(c.choices)||c.choices.length>8) errors.push(`Card ${c.id} must have 0–8 choices.`);
  }
  if(!ids.has(stack.start)) errors.push('Start card is missing.');
  if(!Array.isArray(stack.flags)||stack.flags.length>16)errors.push('Declare at most 16 flags.');
  const flags=new Set(Array.isArray(stack.flags)?stack.flags:[]);
  if([...flags].some(f=>typeof f!=='string'||!/^[a-z0-9_-]{1,40}$/i.test(f))) errors.push('Invalid flag name.');
  for(const c of stack.cards) for(const ch of Array.isArray(c.choices)?c.choices:[]){
    if(!ch||typeof ch!=='object'){errors.push(`Invalid choice in ${c.id}.`);continue;}
    if(typeof ch.label!=='string'||!ch.label.trim()) errors.push(`Empty choice in ${c.id}.`);
    if(!ids.has(ch.to)) errors.push(`Broken link: ${c.id} → ${ch.to}`);
    for(const field of ['require','forbid','set','clear']) if(ch[field]!==undefined && (!Array.isArray(ch[field])||ch[field].some(f=>!flags.has(f)))) errors.push(`Unknown flags in ${c.id}/${field}.`);
  }
  // Reachability ignores gates; a separate state-space pass checks reachable endings.
  const seen=new Set(), queue=[stack.start];
  while(queue.length){const id=queue.shift();if(seen.has(id))continue;seen.add(id);const c=stack.cards.find(c=>c.id===id);if(c&&Array.isArray(c.choices))for(const ch of c.choices)if(ch&&typeof ch==='object')queue.push(ch.to);}
  for(const id of ids)if(!seen.has(id))errors.push(`Unreachable card: ${id}`);
  return [...new Set(errors)];
}

export class StackSession {
  constructor(stack){const errors=validateStack(stack);if(errors.length)throw Error(errors.join('\n'));this.stack=structuredClone(stack);this.restart();}
  restart(){this.cardId=this.stack.start;this.flags=new Set();this.history=[];return this.view();}
  card(){return this.stack.cards.find(c=>c.id===this.cardId);}
  choices(){return this.card().choices.filter(c=>(c.require||[]).every(x=>this.flags.has(x))&&(c.forbid||[]).every(x=>!this.flags.has(x)));}
  view(){return {title:this.stack.title,card:structuredClone(this.card()),choices:structuredClone(this.choices()),flags:[...this.flags],steps:this.history.length};}
  choose(index){
    const options=this.choices();
    if(!Number.isInteger(index)||index<0||index>=options.length)throw Error('Choice is not available.');
    const c=options[index];this.history.push({cardId:this.cardId,flags:[...this.flags]});
    for(const f of c.clear||[])this.flags.delete(f);for(const f of c.set||[])this.flags.add(f);this.cardId=c.to;return this.view();
  }
  back(){if(!this.history.length)return this.view();const old=this.history.pop();this.cardId=old.cardId;this.flags=new Set(old.flags);return this.view();}
  save(){return JSON.stringify({version:1,stackId:this.stack.id,cardId:this.cardId,flags:[...this.flags],history:this.history});}
  restore(raw){
    const d=JSON.parse(raw);
    const ids=new Set(this.stack.cards.map(c=>c.id)),fs=new Set(this.stack.flags||[]);
    if(d.version!==1||d.stackId!==this.stack.id||!ids.has(d.cardId)||!Array.isArray(d.flags)||d.flags.some(f=>!fs.has(f))||!Array.isArray(d.history)||d.history.length>10000||d.history.some(h=>!ids.has(h.cardId)||!Array.isArray(h.flags)||h.flags.some(f=>!fs.has(f))))throw Error('Save file does not match this stack.');
    this.cardId=d.cardId;this.flags=new Set(d.flags);this.history=structuredClone(d.history);return this.view();
  }
}

export function explore(stack,limit=10000){
  const session=new StackSession(stack), queue=[session.save()], seen=new Set(), endings=new Set();
  while(queue.length){
    if(seen.size>=limit)throw Error('State-space limit reached.');
    session.restore(queue.shift());const key=JSON.stringify([session.cardId,[...session.flags].sort()]);if(seen.has(key))continue;seen.add(key);
    if(!session.choices().length)endings.add(session.cardId);
    const before=session.save(),count=session.choices().length;for(let i=0;i<count;i++){session.restore(before);session.choose(i);queue.push(session.save());}
  }
  return {reachableStates:seen.size,endings:[...endings].sort()};
}
