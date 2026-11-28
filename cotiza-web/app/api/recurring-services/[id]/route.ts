import { NextResponse } from "next/server";
import { authorizeRecurring } from "@/lib/recurring-access";
import { getRecurring } from "@/lib/db/recurring-services";
import { RecurringError } from "@/lib/domain/recurring-services";
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}) {
  try {
    const actor=await authorizeRecurring(request),{id}=await params;
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))return NextResponse.json({error:'Acuerdo no encontrado'},{status:404});
    return NextResponse.json({agreement:await getRecurring(actor,id)},{headers:{'Cache-Control':'no-store'}});
  }catch(error){return NextResponse.json({error:error instanceof RecurringError?error.message:'No se pudo consultar el acuerdo'},{status:error instanceof RecurringError?error.status:503});}
}
