/** Split PostgreSQL migration statements without splitting quoted function bodies. */
export function splitSql(sql) {
  const result=[];let start=0,quote=null,dollar=null,line=false,block=0;
  for(let i=0;i<sql.length;i++){
    const c=sql[i],next=sql[i+1];
    if(line){if(c==='\n')line=false;continue;}
    if(block){if(c==='/'&&next==='*'){block++;i++;}else if(c==='*'&&next==='/'){block--;i++;}continue;}
    if(dollar){if(sql.startsWith(dollar,i)){i+=dollar.length-1;dollar=null;}continue;}
    if(quote){if(c===quote){if(next===quote)i++;else quote=null;}continue;}
    if(c==='-'&&next==='-'){line=true;i++;continue;}
    if(c==='/'&&next==='*'){block=1;i++;continue;}
    if(c==="'"||c==='"'){quote=c;continue;}
    if(c==='$'){
      const match=sql.slice(i).match(/^\$(?:[A-Za-z_][A-Za-z_0-9]*)?\$/);
      if(match){dollar=match[0];i+=dollar.length-1;continue;}
    }
    if(c===';'){const statement=sql.slice(start,i+1).trim();if(statement)result.push(statement);start=i+1;}
  }
  if(quote||dollar||block)throw new Error('Unterminated SQL quoting');
  const tail=sql.slice(start).trim();if(tail)result.push(tail);
  return result;
}
