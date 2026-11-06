export const lighthouse={id:'last-light',title:'The Last Lighthouse',start:'harbor',flags:['lens','code','charged'],cards:[
{id:'harbor',title:'Two keepers, one light',body:'The lighthouse has gone dark. One keeper searches the shore; the other reads the keeper’s notebook. Pass the keyboard when the role changes. You can undo a move.',choices:[{label:'Search the shore',to:'shore'},{label:'Open the notebook',to:'notebook'}]},
{id:'shore',title:'Shore keeper',body:'A polished glass lens lies beside an old hand generator. The generator is connected to nothing.',choices:[{label:'Take the lens and return',to:'harbor',set:['lens'],forbid:['lens']},{label:'Turn the generator to charge the battery',to:'harbor',set:['charged'],forbid:['charged']},{label:'Return to the harbor',to:'harbor'}]},
{id:'notebook',title:'Notebook keeper',body:'Three flashes, then one. The tower opens at 31. A lamp needs a lens AND a charged battery. The next keeper can now take over.',choices:[{label:'Remember 31 and return',to:'harbor',set:['code']},{label:'Walk to the tower',to:'tower'}]},
{id:'tower',title:'At the tower door',body:'The keypad waits. A wrong answer sends you back to the harbor; nothing is lost.',choices:[{label:'Enter 13',to:'harbor'},{label:'Enter 31',to:'lamp',require:['code']},{label:'Return to the harbor',to:'harbor'}]},
{id:'lamp',title:'The silent lamp',body:'Fit the lens and connect the battery. Each missing part is a reason to return, not a timed failure.',choices:[{label:'Fit lens and connect battery',to:'ending',require:['lens','charged']},{label:'Return for the missing parts',to:'harbor'}]},
{id:'ending',title:'A light across the bay',body:'The beam sweeps over the water. The two keepers made a working circuit: a source, a lamp, and the lens that directs the light. End of this fictional puzzle.',choices:[]}
]};

export const circuit={id:'circuit-garden',title:'Circuit Garden',start:'gate',flags:['switch_a','switch_b'],cards:[
{id:'gate',title:'Can you light both paths?',body:'This original learning puzzle models two switches in series. A light turns on only when A AND B are closed. This is a logic toy, not an electrical wiring guide.',choices:[{label:'Close switch A',to:'gate',set:['switch_a'],forbid:['switch_a']},{label:'Close switch B',to:'gate',set:['switch_b'],forbid:['switch_b']},{label:'Open switch A',to:'gate',clear:['switch_a'],require:['switch_a']},{label:'Open switch B',to:'gate',clear:['switch_b'],require:['switch_b']},{label:'Walk through the lit gate',to:'lit',require:['switch_a','switch_b']}]},
{id:'lit',title:'Both switches are closed',body:'A AND B is true. Undo to change one switch and see the gate close again.',choices:[]}
]};
export const stacks=[lighthouse,circuit];
