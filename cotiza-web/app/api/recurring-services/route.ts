import { NextResponse } from "next/server";
import { authorizeRecurring } from "@/lib/recurring-access";
import { actOnRecurring,listRecurring,findRecurringRequest } from "@/lib/db/recurring-services";
import { RecurringError,recurringActionSchema } from "@/lib/domain/recurring-services";

export const dynamic='force-dynamic';
function failure(error:unknown) {
  if(error instanceof RecurringError)return NextResponse.json({error:error.message},{status:error.status});
  // An uncertain write must be re-read; never encourage blind resubmission or leak SQL.
  return NextResponse.json({error:"No se pudo confirmar el resultado. Consulta el acuerdo antes de repetir."},{status:503});
}
export async function GET(request:Request) {
  try {
    const actor=await authorizeRecurring(request),url=new URL(request.url);
    const requestId=url.searchParams.get('requestId');
    if(requestId!==null) {
      if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId))return NextResponse.json({error:'Clave de alta inválida'},{status:422});
      return NextResponse.json({agreement:await findRecurringRequest(actor,requestId)},{headers:{'Cache-Control':'no-store'}});
    }
    const before=url.searchParams.get('before');
    if(before && !/^SR-\d{10}$/.test(before))return NextResponse.json({error:'Cursor inválido'},{status:422});
    const data=await listRecurring(actor,url.searchParams.get('clientSearch')??'',before??undefined);
    return NextResponse.json(data,{headers:{'Cache-Control':'no-store'}});
  }catch(error){return failure(error);}
}
export async function POST(request:Request) {
  try {
    const actor=await authorizeRecurring(request);
    if(Number(request.headers.get('content-length')??0)>65536)return NextResponse.json({error:'Solicitud demasiado grande'},{status:413});
    const text=await request.text();
    if(new TextEncoder().encode(text).length>65536)return NextResponse.json({error:'Solicitud demasiado grande'},{status:413});
    let json:unknown;try{json=JSON.parse(text);}catch{return NextResponse.json({error:'JSON inválido'},{status:422});}
    const parsed=recurringActionSchema.safeParse(json);
    if(!parsed.success)return NextResponse.json({error:parsed.error.issues[0]?.message??'Datos inválidos'},{status:422});
    const agreement=await actOnRecurring(actor,parsed.data);
    return NextResponse.json({agreement},{headers:{'Cache-Control':'no-store'}});
  }catch(error){return failure(error);}
}
