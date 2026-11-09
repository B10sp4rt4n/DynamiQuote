-- Synthetic tenant provisioning. Execute as a transaction after verifying the target database.
-- No emails, Clerk accounts, opportunities, won sales or fiscal issuance.

INSERT INTO tenants(tenant_id,name,slug,active,created_at,rfc,razon_social,fiscal_regime,fiscal_zip_code,address,closing_contact_label,closing_contact_level) VALUES ('90dbf915-de98-4ebb-b88c-f27b6e8c645a','Cotiza Lab — PRUEBAS','cotiza-lab',true,now(),'IIA040805DZ4','INDISTRIA ILUMINADORA DE ALMACENES','626','32690','DOMICILIO DE EJEMPLO DEL PAC - SOLO QA','LABORATORIO DE PRUEBAS','contacto') ON CONFLICT (tenant_id) DO NOTHING;

INSERT INTO tenant_operation_profiles(tenant_id,operation_mode,updated_by) VALUES ('90dbf915-de98-4ebb-b88c-f27b6e8c645a','mixed','setup:cotiza-lab:20261109') ON CONFLICT DO NOTHING;

INSERT INTO tenant_operation_events(event_id,tenant_id,previous_mode,operation_mode,changed_by) SELECT 'cotiza-lab-mode-initial','90dbf915-de98-4ebb-b88c-f27b6e8c645a','consultative','mixed','setup:cotiza-lab:20261109' WHERE NOT EXISTS(SELECT 1 FROM tenant_operation_events WHERE event_id='cotiza-lab-mode-initial');

INSERT INTO tenant_margin_policies(tenant_id,min_margin_pct,max_margin_pct,high_preapproval_margin_pct,require_observer_approval,created_by,updated_by) VALUES ('90dbf915-de98-4ebb-b88c-f27b6e8c645a',10,35,55,false,'setup:cotiza-lab:20261109','setup:cotiza-lab:20261109') ON CONFLICT DO NOTHING;

INSERT INTO company_logos(logo_id,logo_name,logo_type,company_name,logo_data,logo_format,uploaded_at,is_default,tenant_id) VALUES ('9545535f-4c60-4bde-b2c7-9de4fefa63a9','Cotiza Lab - PRUEBAS','issuer','COTIZA LAB - SIN VALIDEZ FISCAL',decode('PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MDAiIGhlaWdodD0iMjIwIj48cmVjdCB3aWR0aD0iODAwIiBoZWlnaHQ9IjIyMCIgcng9IjI0IiBmaWxsPSIjMzEyZTgxIi8+PHRleHQgeD0iMzgiIHk9IjEwNSIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjY2IiBmaWxsPSJ3aGl0ZSI+Q09USVpBIExBQjwvdGV4dD48dGV4dCB4PSI0MCIgeT0iMTYzIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMjUiIGZpbGw9IiNjN2QyZmUiPlBSVUVCQVMgwrcgU0lOIFZBTElERVogRklTQ0FMPC90ZXh0Pjwvc3ZnPg==','base64'),'svg',now(),true,'90dbf915-de98-4ebb-b88c-f27b6e8c645a') ON CONFLICT DO NOTHING;

INSERT INTO clients(client_id,tenant_id,company,rfc,fiscal_regime,zip_code,cfdi_use,notes,active) VALUES ('e346ea67-08b4-4c95-981b-81fd661fb517','90dbf915-de98-4ebb-b88c-f27b6e8c645a','ESCUELA KEMPER URGATE','EKU9003173C9','603','42501','G03','Identidad de ejemplo del PAC; utilizar exclusivamente en QA.',true) ON CONFLICT DO NOTHING;

INSERT INTO clients(client_id,tenant_id,company,rfc,fiscal_regime,zip_code,cfdi_use,notes,active) VALUES ('1ef0b32b-84be-4611-a5dc-61f91f93bbed','90dbf915-de98-4ebb-b88c-f27b6e8c645a','LAB - Receptor con datos pendientes',NULL,NULL,NULL,NULL,'Caso negativo: debe bloquear prefactura o timbrado hasta completar datos.',true) ON CONFLICT DO NOTHING;

INSERT INTO clients(client_id,tenant_id,company,rfc,fiscal_regime,zip_code,cfdi_use,notes,active) VALUES ('1a221446-037a-4a0a-a177-1f6b16cf3c0b','90dbf915-de98-4ebb-b88c-f27b6e8c645a','LAB - Receptor extranjero','XEXX010101000','616','32690','S01','Caso de pruebas extranjero; moneda y reglas fiscales pendientes de validación. No timbrar.',true) ON CONFLICT DO NOTHING;

INSERT INTO packages(package_id,tenant_id,pkg_number,name,description,created_at,created_by,active,source_metadata) VALUES ('60372d23-ea6a-4fcc-bebc-2449bfd0433e','90dbf915-de98-4ebb-b88c-f27b6e8c645a','PKG-LAB-2026-0001','LAB - Servicio PUE','DATOS SINTETICOS - SIN OPERACION COMERCIAL REAL',now(),'setup:cotiza-lab:20261109',true,'{"environment":"sandbox","synthetic":true,"origin":"cotiza-lab-setup"}'::jsonb) ON CONFLICT DO NOTHING;

INSERT INTO package_lines(line_id,package_id,tenant_id,line_order,sku,description,quantity,cost_unit,price_unit,margin_pct,classification1,classification2) VALUES ('lab-line-1','60372d23-ea6a-4fcc-bebc-2449bfd0433e','90dbf915-de98-4ebb-b88c-f27b6e8c645a',1,'LAB-PUE-001','Servicio de ejemplo - SOLO PRUEBAS',1,75.0,100,25,'LAB','PRUEBAS') ON CONFLICT DO NOTHING;

INSERT INTO packages(package_id,tenant_id,pkg_number,name,description,created_at,created_by,active,source_metadata) VALUES ('3747ad99-fb2d-4feb-9f70-afdefd06c907','90dbf915-de98-4ebb-b88c-f27b6e8c645a','PKG-LAB-2026-0002','LAB - Servicio PPD y dos pagos','DATOS SINTETICOS - SIN OPERACION COMERCIAL REAL',now(),'setup:cotiza-lab:20261109',true,'{"environment":"sandbox","synthetic":true,"origin":"cotiza-lab-setup"}'::jsonb) ON CONFLICT DO NOTHING;

INSERT INTO package_lines(line_id,package_id,tenant_id,line_order,sku,description,quantity,cost_unit,price_unit,margin_pct,classification1,classification2) VALUES ('lab-line-2','3747ad99-fb2d-4feb-9f70-afdefd06c907','90dbf915-de98-4ebb-b88c-f27b6e8c645a',1,'LAB-PPD-001','Servicio de ejemplo - SOLO PRUEBAS',1,187.5,250,25,'LAB','PRUEBAS') ON CONFLICT DO NOTHING;

INSERT INTO packages(package_id,tenant_id,pkg_number,name,description,created_at,created_by,active,source_metadata) VALUES ('bbb87be1-eca3-45b8-bbb0-3e7e15af83c7','90dbf915-de98-4ebb-b88c-f27b6e8c645a','PKG-LAB-2026-0003','LAB - Venta directa','DATOS SINTETICOS - SIN OPERACION COMERCIAL REAL',now(),'setup:cotiza-lab:20261109',true,'{"environment":"sandbox","synthetic":true,"origin":"cotiza-lab-setup"}'::jsonb) ON CONFLICT DO NOTHING;

INSERT INTO package_lines(line_id,package_id,tenant_id,line_order,sku,description,quantity,cost_unit,price_unit,margin_pct,classification1,classification2) VALUES ('lab-line-3','bbb87be1-eca3-45b8-bbb0-3e7e15af83c7','90dbf915-de98-4ebb-b88c-f27b6e8c645a',1,'LAB-DIRECTA-001','Servicio de ejemplo - SOLO PRUEBAS',1,750.0,1000,25,'LAB','PRUEBAS') ON CONFLICT DO NOTHING;
