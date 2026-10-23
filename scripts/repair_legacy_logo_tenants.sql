-- Rehearsal only: br-old-pond-ahe5jto3. Do not apply to production without approval.
-- Generated offline from docs/evidence/legacy-logo-repair-manifest-20261022.json.
-- Apply document tenant repair first. All original assets and existing defaults are preserved.
BEGIN;
-- statement-breakpoint
SET LOCAL lock_timeout = '5s';
-- statement-breakpoint
LOCK TABLE company_logos,formal_proposals,clients IN SHARE ROW EXCLUSIVE MODE;
-- statement-breakpoint
CREATE TEMP TABLE crm_logo_copy_manifest(source_logo_id text NOT NULL,tenant_id text NOT NULL,
      copy_logo_id text UNIQUE NOT NULL,source_hash text NOT NULL,PRIMARY KEY(source_logo_id,tenant_id)) ON COMMIT DROP;
-- statement-breakpoint
INSERT INTO crm_logo_copy_manifest VALUES
('0f2c2057-5aae-434c-906a-a2013c35a528','389b6cc1-2f8d-4fe4-bc3d-f50f92df3157','crm-legacy-logo:389b6cc1-2f8d-4fe4-bc3d-f50f92df3157:0f2c2057-5aae-434c-906a-a2013c35a528','626fd01ce0791ad968549e53da09a6bb'),
('52e3d239-9e0b-4789-ad87-86d4a357e8d6','389b6cc1-2f8d-4fe4-bc3d-f50f92df3157','crm-legacy-logo:389b6cc1-2f8d-4fe4-bc3d-f50f92df3157:52e3d239-9e0b-4789-ad87-86d4a357e8d6','4c2694e0909dd44f576effc279917df4'),
('0f2c2057-5aae-434c-906a-a2013c35a528','7ee39632-74ea-4fee-a3cb-c028e87cecfc','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:0f2c2057-5aae-434c-906a-a2013c35a528','626fd01ce0791ad968549e53da09a6bb'),
('12a062f9-8883-44e6-8ffb-c5b9be3b5d5f','7ee39632-74ea-4fee-a3cb-c028e87cecfc','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:12a062f9-8883-44e6-8ffb-c5b9be3b5d5f','98711eb49eb1b30cafd887c6c449f775'),
('12dfafa6-b49b-4a38-b45e-95cd115bcb0b','7ee39632-74ea-4fee-a3cb-c028e87cecfc','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:12dfafa6-b49b-4a38-b45e-95cd115bcb0b','2af841c6d295419f10dbe80b86d87e36'),
('13e95e78-2b45-4c13-a978-f1edf0955746','7ee39632-74ea-4fee-a3cb-c028e87cecfc','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:13e95e78-2b45-4c13-a978-f1edf0955746','efd87ec3707991e8c43bf5dc38e54656'),
('14d87492-239a-4cee-9352-c06491d0094a','7ee39632-74ea-4fee-a3cb-c028e87cecfc','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:14d87492-239a-4cee-9352-c06491d0094a','021529fc06b29191349c180ab4aacf69'),
('17a98a3b-cf6f-4542-a411-a36bfb4cea46','7ee39632-74ea-4fee-a3cb-c028e87cecfc','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:17a98a3b-cf6f-4542-a411-a36bfb4cea46','6df437661f44be7e6dd92ae6aa8a5b36'),
('19e3c64d-099c-4b8d-838c-f6a5e4433d43','7ee39632-74ea-4fee-a3cb-c028e87cecfc','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:19e3c64d-099c-4b8d-838c-f6a5e4433d43','c5eae0c2fa9e7dad4c4cb5d61a4c4850'),
('24a03057-fe39-4dc2-97f5-026a14f3cadb','7ee39632-74ea-4fee-a3cb-c028e87cecfc','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:24a03057-fe39-4dc2-97f5-026a14f3cadb','e1b145344167ddeaaa458e5e006e0184'),
('24db1f00-e2d3-44f0-804d-a5c471be4ee4','7ee39632-74ea-4fee-a3cb-c028e87cecfc','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:24db1f00-e2d3-44f0-804d-a5c471be4ee4','3767d69b7904eaea4dfa5c9c26922d53'),
('2a9dfb5d-39ea-4f57-96b4-6889ba3abc16','7ee39632-74ea-4fee-a3cb-c028e87cecfc','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:2a9dfb5d-39ea-4f57-96b4-6889ba3abc16','9d6ca75a321df8399782679521d5eeb4'),
('347c244d-04bd-4a73-92f6-dd85c5bf2ed7','7ee39632-74ea-4fee-a3cb-c028e87cecfc','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:347c244d-04bd-4a73-92f6-dd85c5bf2ed7','e5b46161c5d459c428f65432c376240b'),
('35e4af9c-c7f8-429d-9061-3219eccc88ee','7ee39632-74ea-4fee-a3cb-c028e87cecfc','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:35e4af9c-c7f8-429d-9061-3219eccc88ee','90b086a40fdb4e3a3f0b424d89469260'),
('3b0ba0e4-8d85-4057-8e74-60e1d929c70a','7ee39632-74ea-4fee-a3cb-c028e87cecfc','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:3b0ba0e4-8d85-4057-8e74-60e1d929c70a','5a8f25773fa69e69fa48cac1ab926490'),
('44e62792-350a-45c4-b041-2095c2a015e8','7ee39632-74ea-4fee-a3cb-c028e87cecfc','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:44e62792-350a-45c4-b041-2095c2a015e8','6af89029690d02c8970ef171f6cc89a6'),
('47a6f43c-4fcd-4800-8c5d-62661745fe81','7ee39632-74ea-4fee-a3cb-c028e87cecfc','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:47a6f43c-4fcd-4800-8c5d-62661745fe81','ac81e92bdefddc24e6598a21d6194367'),
('4f64c340-57c5-40d0-8a09-63a18e245c17','7ee39632-74ea-4fee-a3cb-c028e87cecfc','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:4f64c340-57c5-40d0-8a09-63a18e245c17','aa66db213a34d4460468b7da1197d98d'),
('52e3d239-9e0b-4789-ad87-86d4a357e8d6','7ee39632-74ea-4fee-a3cb-c028e87cecfc','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:52e3d239-9e0b-4789-ad87-86d4a357e8d6','4c2694e0909dd44f576effc279917df4'),
('533d715d-17ab-467b-97a0-9f3be808228b','7ee39632-74ea-4fee-a3cb-c028e87cecfc','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:533d715d-17ab-467b-97a0-9f3be808228b','e5c2045437891a41ae6f1a7d5be8ff18'),
('53c268f2-179b-42eb-bf9f-e7b5fd690fbf','7ee39632-74ea-4fee-a3cb-c028e87cecfc','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:53c268f2-179b-42eb-bf9f-e7b5fd690fbf','f48df11031ae63f24806fdaf3d4d5402'),
('5c3da1d4-93ee-4c0d-b9cd-060edf61ae34','7ee39632-74ea-4fee-a3cb-c028e87cecfc','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:5c3da1d4-93ee-4c0d-b9cd-060edf61ae34','c3f53ba519a520cbaeca26f14d4b9ce0'),
('65bcc8b9-b6bf-4db1-88a6-ac4de81906f6','7ee39632-74ea-4fee-a3cb-c028e87cecfc','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:65bcc8b9-b6bf-4db1-88a6-ac4de81906f6','07a06edce27f00164bcf2ea9176ff637'),
('67427bfb-cea2-4fa4-892e-5144feb91896','7ee39632-74ea-4fee-a3cb-c028e87cecfc','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:67427bfb-cea2-4fa4-892e-5144feb91896','7d2762bc0023990fab7e1fac55147aa7'),
('6cceb151-4963-4ced-a656-f678f50f851e','7ee39632-74ea-4fee-a3cb-c028e87cecfc','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:6cceb151-4963-4ced-a656-f678f50f851e','c38ebcfb4c6a21a3bb166af9f49dd49a'),
('6ee2f5aa-ad7f-4fc9-8270-408550735e2f','7ee39632-74ea-4fee-a3cb-c028e87cecfc','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:6ee2f5aa-ad7f-4fc9-8270-408550735e2f','b47e3bbd04c429125e74e3a6a90ce783'),
('741be125-3b36-4b97-aa9b-6d4302c8e5c0','7ee39632-74ea-4fee-a3cb-c028e87cecfc','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:741be125-3b36-4b97-aa9b-6d4302c8e5c0','caa5afa8ca558938048c78977311f044'),
('818ff950-f764-4441-8a50-0ebd7ff8485a','7ee39632-74ea-4fee-a3cb-c028e87cecfc','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:818ff950-f764-4441-8a50-0ebd7ff8485a','20af8f5837c2dab8e831d7975fd0e81c'),
('9438f8b0-7460-428f-ab71-3006a7012677','7ee39632-74ea-4fee-a3cb-c028e87cecfc','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:9438f8b0-7460-428f-ab71-3006a7012677','fed0b7c2befd7ee7106d0b9fe7c472cf'),
('9adc72c0-a814-4a4e-898d-2be5ae57c015','7ee39632-74ea-4fee-a3cb-c028e87cecfc','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:9adc72c0-a814-4a4e-898d-2be5ae57c015','044bf56b7f1b98bfbbf360f73bb37569'),
('b868ba42-b408-4433-a338-b7bb1a3f2edc','7ee39632-74ea-4fee-a3cb-c028e87cecfc','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:b868ba42-b408-4433-a338-b7bb1a3f2edc','32d1ef616ec4663285a679da259bee87'),
('bb53483c-93c2-4a8c-b249-ddaabc78181f','7ee39632-74ea-4fee-a3cb-c028e87cecfc','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:bb53483c-93c2-4a8c-b249-ddaabc78181f','5f3f54ee0dcf011c26a868faa7747010'),
('bc7674ce-d1a7-42ed-abcc-f2f079bf34de','7ee39632-74ea-4fee-a3cb-c028e87cecfc','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:bc7674ce-d1a7-42ed-abcc-f2f079bf34de','66c6d406dab223f39bae46dd15d51f47'),
('c2106764-d553-4da5-b9bd-d0ca9ce1e4a5','7ee39632-74ea-4fee-a3cb-c028e87cecfc','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:c2106764-d553-4da5-b9bd-d0ca9ce1e4a5','9d05342cefbfdcc2a02038b2dc49df2b'),
('c6223261-d6ad-4fb8-a067-a39171b6b541','7ee39632-74ea-4fee-a3cb-c028e87cecfc','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:c6223261-d6ad-4fb8-a067-a39171b6b541','88f75b399ce04ad41c9adaf2ea6931cd'),
('c9418e5d-a540-4610-bd91-954a6344e61b','7ee39632-74ea-4fee-a3cb-c028e87cecfc','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:c9418e5d-a540-4610-bd91-954a6344e61b','b0a0c3f99e9adf805a60c76697ed9e6b'),
('e237f09e-0ae6-402f-9b6d-ad1e56d790cb','7ee39632-74ea-4fee-a3cb-c028e87cecfc','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:e237f09e-0ae6-402f-9b6d-ad1e56d790cb','734567a3250b177461a58b43e290bc7d'),
('f035d609-9551-40d0-9edc-d9a83b4b6ed6','7ee39632-74ea-4fee-a3cb-c028e87cecfc','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:f035d609-9551-40d0-9edc-d9a83b4b6ed6','04b2b9f22696cc2afa7bb289e8a8c10a'),
('f1a4e491-ed03-4992-8056-7c8353ec044f','7ee39632-74ea-4fee-a3cb-c028e87cecfc','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:f1a4e491-ed03-4992-8056-7c8353ec044f','e269c7e8520a28d304c861cf211a3dfc'),
('f740b66a-e31c-4cbf-9f06-9a5165432623','7ee39632-74ea-4fee-a3cb-c028e87cecfc','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:f740b66a-e31c-4cbf-9f06-9a5165432623','8eaeca63f321e4af8334b860be31a903'),
('f9034eb3-214e-42f1-b6bb-49e8edbe86ac','7ee39632-74ea-4fee-a3cb-c028e87cecfc','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:f9034eb3-214e-42f1-b6bb-49e8edbe86ac','d96e73229ebf6c529e3e174b85ef3ff0'),
('52e3d239-9e0b-4789-ad87-86d4a357e8d6','b0e92d15-2e87-4c1a-93ac-3399bf8fe515','crm-legacy-logo:b0e92d15-2e87-4c1a-93ac-3399bf8fe515:52e3d239-9e0b-4789-ad87-86d4a357e8d6','4c2694e0909dd44f576effc279917df4'),
('b149275b-3d2f-4cdf-91a9-2e226d9214d3','b0e92d15-2e87-4c1a-93ac-3399bf8fe515','crm-legacy-logo:b0e92d15-2e87-4c1a-93ac-3399bf8fe515:b149275b-3d2f-4cdf-91a9-2e226d9214d3','07705c7ab745bbed7b6ea62637c73b2d'),
('bc7674ce-d1a7-42ed-abcc-f2f079bf34de','b0e92d15-2e87-4c1a-93ac-3399bf8fe515','crm-legacy-logo:b0e92d15-2e87-4c1a-93ac-3399bf8fe515:bc7674ce-d1a7-42ed-abcc-f2f079bf34de','66c6d406dab223f39bae46dd15d51f47'),
('ef8a58f1-326d-43b9-8fef-7113a1199ad4','b0e92d15-2e87-4c1a-93ac-3399bf8fe515','crm-legacy-logo:b0e92d15-2e87-4c1a-93ac-3399bf8fe515:ef8a58f1-326d-43b9-8fef-7113a1199ad4','35e223f512afea93c97ee680b0b2386f');
-- statement-breakpoint
CREATE TEMP TABLE crm_logo_ref_manifest(parent_table text NOT NULL,parent_id text NOT NULL,field text NOT NULL,
      tenant_id text NOT NULL,source_logo_id text NOT NULL,copy_logo_id text NOT NULL,
      PRIMARY KEY(parent_table,parent_id,field)) ON COMMIT DROP;
-- statement-breakpoint
INSERT INTO crm_logo_ref_manifest VALUES
('formal_proposals','00a40d13-126c-4b58-b5d5-9ff177884c95','client_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','741be125-3b36-4b97-aa9b-6d4302c8e5c0','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:741be125-3b36-4b97-aa9b-6d4302c8e5c0'),
('formal_proposals','00a40d13-126c-4b58-b5d5-9ff177884c95','issuer_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','0f2c2057-5aae-434c-906a-a2013c35a528','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:0f2c2057-5aae-434c-906a-a2013c35a528'),
('formal_proposals','06ee3b29-b009-4d71-a310-ca74288ab255','client_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','741be125-3b36-4b97-aa9b-6d4302c8e5c0','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:741be125-3b36-4b97-aa9b-6d4302c8e5c0'),
('formal_proposals','06ee3b29-b009-4d71-a310-ca74288ab255','issuer_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','0f2c2057-5aae-434c-906a-a2013c35a528','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:0f2c2057-5aae-434c-906a-a2013c35a528'),
('formal_proposals','077d9fcd-c1a6-4de1-a281-6017c975404f','client_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','c6223261-d6ad-4fb8-a067-a39171b6b541','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:c6223261-d6ad-4fb8-a067-a39171b6b541'),
('formal_proposals','077d9fcd-c1a6-4de1-a281-6017c975404f','issuer_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','0f2c2057-5aae-434c-906a-a2013c35a528','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:0f2c2057-5aae-434c-906a-a2013c35a528'),
('formal_proposals','0b0c2578-e6b2-47b9-94b9-412c4364d5db','client_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','741be125-3b36-4b97-aa9b-6d4302c8e5c0','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:741be125-3b36-4b97-aa9b-6d4302c8e5c0'),
('formal_proposals','0b0c2578-e6b2-47b9-94b9-412c4364d5db','issuer_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','0f2c2057-5aae-434c-906a-a2013c35a528','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:0f2c2057-5aae-434c-906a-a2013c35a528'),
('formal_proposals','0de87d8f-b7cd-4715-8443-cec07f63303b','client_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','9adc72c0-a814-4a4e-898d-2be5ae57c015','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:9adc72c0-a814-4a4e-898d-2be5ae57c015'),
('formal_proposals','0de87d8f-b7cd-4715-8443-cec07f63303b','issuer_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','0f2c2057-5aae-434c-906a-a2013c35a528','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:0f2c2057-5aae-434c-906a-a2013c35a528'),
('formal_proposals','0e5c5092-565d-499e-b273-aae4c90c3d97','issuer_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','0f2c2057-5aae-434c-906a-a2013c35a528','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:0f2c2057-5aae-434c-906a-a2013c35a528'),
('formal_proposals','10f723ee-e0a0-4f1f-849d-b23ac02a774a','client_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','b868ba42-b408-4433-a338-b7bb1a3f2edc','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:b868ba42-b408-4433-a338-b7bb1a3f2edc'),
('formal_proposals','10f723ee-e0a0-4f1f-849d-b23ac02a774a','issuer_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','0f2c2057-5aae-434c-906a-a2013c35a528','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:0f2c2057-5aae-434c-906a-a2013c35a528'),
('formal_proposals','155067ad-a45f-432a-8aca-d0114056c637','client_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','f9034eb3-214e-42f1-b6bb-49e8edbe86ac','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:f9034eb3-214e-42f1-b6bb-49e8edbe86ac'),
('formal_proposals','155067ad-a45f-432a-8aca-d0114056c637','issuer_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','0f2c2057-5aae-434c-906a-a2013c35a528','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:0f2c2057-5aae-434c-906a-a2013c35a528'),
('formal_proposals','17aef362-951c-4ee7-85c7-fefcb3fa6d3c','issuer_logo_id','389b6cc1-2f8d-4fe4-bc3d-f50f92df3157','0f2c2057-5aae-434c-906a-a2013c35a528','crm-legacy-logo:389b6cc1-2f8d-4fe4-bc3d-f50f92df3157:0f2c2057-5aae-434c-906a-a2013c35a528'),
('formal_proposals','1906437c-dc15-4fac-9e04-31ce8d752433','client_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','741be125-3b36-4b97-aa9b-6d4302c8e5c0','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:741be125-3b36-4b97-aa9b-6d4302c8e5c0'),
('formal_proposals','1906437c-dc15-4fac-9e04-31ce8d752433','issuer_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','0f2c2057-5aae-434c-906a-a2013c35a528','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:0f2c2057-5aae-434c-906a-a2013c35a528'),
('formal_proposals','198a9a3e-c5a6-466d-b006-30ca90990a09','issuer_logo_id','389b6cc1-2f8d-4fe4-bc3d-f50f92df3157','0f2c2057-5aae-434c-906a-a2013c35a528','crm-legacy-logo:389b6cc1-2f8d-4fe4-bc3d-f50f92df3157:0f2c2057-5aae-434c-906a-a2013c35a528'),
('formal_proposals','1d35c5e2-b555-4097-818b-07077df3b7fe','client_logo_id','b0e92d15-2e87-4c1a-93ac-3399bf8fe515','ef8a58f1-326d-43b9-8fef-7113a1199ad4','crm-legacy-logo:b0e92d15-2e87-4c1a-93ac-3399bf8fe515:ef8a58f1-326d-43b9-8fef-7113a1199ad4'),
('formal_proposals','1d35c5e2-b555-4097-818b-07077df3b7fe','issuer_logo_id','b0e92d15-2e87-4c1a-93ac-3399bf8fe515','bc7674ce-d1a7-42ed-abcc-f2f079bf34de','crm-legacy-logo:b0e92d15-2e87-4c1a-93ac-3399bf8fe515:bc7674ce-d1a7-42ed-abcc-f2f079bf34de'),
('formal_proposals','29991ea8-3804-49a7-9532-56b44789dc4d','client_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','741be125-3b36-4b97-aa9b-6d4302c8e5c0','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:741be125-3b36-4b97-aa9b-6d4302c8e5c0'),
('formal_proposals','29991ea8-3804-49a7-9532-56b44789dc4d','issuer_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','0f2c2057-5aae-434c-906a-a2013c35a528','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:0f2c2057-5aae-434c-906a-a2013c35a528'),
('formal_proposals','2b304d7e-e45f-492d-9daa-c671c818d5aa','issuer_logo_id','b0e92d15-2e87-4c1a-93ac-3399bf8fe515','bc7674ce-d1a7-42ed-abcc-f2f079bf34de','crm-legacy-logo:b0e92d15-2e87-4c1a-93ac-3399bf8fe515:bc7674ce-d1a7-42ed-abcc-f2f079bf34de'),
('formal_proposals','30b2da00-9d29-48b1-9b54-09b16cd2be9d','issuer_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','13e95e78-2b45-4c13-a978-f1edf0955746','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:13e95e78-2b45-4c13-a978-f1edf0955746'),
('formal_proposals','30b72834-7257-4895-af05-567da9f0ea63','issuer_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','0f2c2057-5aae-434c-906a-a2013c35a528','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:0f2c2057-5aae-434c-906a-a2013c35a528'),
('formal_proposals','312bb754-809c-4f51-b1d0-8558bb2e17d7','issuer_logo_id','389b6cc1-2f8d-4fe4-bc3d-f50f92df3157','0f2c2057-5aae-434c-906a-a2013c35a528','crm-legacy-logo:389b6cc1-2f8d-4fe4-bc3d-f50f92df3157:0f2c2057-5aae-434c-906a-a2013c35a528'),
('formal_proposals','35bbc01e-41a3-410f-a65e-a7a855d953ea','client_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','17a98a3b-cf6f-4542-a411-a36bfb4cea46','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:17a98a3b-cf6f-4542-a411-a36bfb4cea46'),
('formal_proposals','35bbc01e-41a3-410f-a65e-a7a855d953ea','issuer_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','0f2c2057-5aae-434c-906a-a2013c35a528','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:0f2c2057-5aae-434c-906a-a2013c35a528'),
('formal_proposals','370245d7-ea98-4a3c-be04-5f06d3eb00b3','client_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','741be125-3b36-4b97-aa9b-6d4302c8e5c0','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:741be125-3b36-4b97-aa9b-6d4302c8e5c0'),
('formal_proposals','370245d7-ea98-4a3c-be04-5f06d3eb00b3','issuer_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','0f2c2057-5aae-434c-906a-a2013c35a528','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:0f2c2057-5aae-434c-906a-a2013c35a528'),
('formal_proposals','389be82f-653f-4337-aa87-b92ea6605529','issuer_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','4f64c340-57c5-40d0-8a09-63a18e245c17','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:4f64c340-57c5-40d0-8a09-63a18e245c17'),
('formal_proposals','3e6177a0-1f3e-4d71-8b94-a12e3c8ce9b1','client_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','f035d609-9551-40d0-9edc-d9a83b4b6ed6','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:f035d609-9551-40d0-9edc-d9a83b4b6ed6'),
('formal_proposals','3e6177a0-1f3e-4d71-8b94-a12e3c8ce9b1','issuer_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','0f2c2057-5aae-434c-906a-a2013c35a528','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:0f2c2057-5aae-434c-906a-a2013c35a528'),
('formal_proposals','41a8ff1a-eaa6-499f-98f0-f41bdcae8b2e','issuer_logo_id','389b6cc1-2f8d-4fe4-bc3d-f50f92df3157','0f2c2057-5aae-434c-906a-a2013c35a528','crm-legacy-logo:389b6cc1-2f8d-4fe4-bc3d-f50f92df3157:0f2c2057-5aae-434c-906a-a2013c35a528'),
('formal_proposals','42bd299c-83f8-4074-acd7-8e9cf772bc25','issuer_logo_id','389b6cc1-2f8d-4fe4-bc3d-f50f92df3157','52e3d239-9e0b-4789-ad87-86d4a357e8d6','crm-legacy-logo:389b6cc1-2f8d-4fe4-bc3d-f50f92df3157:52e3d239-9e0b-4789-ad87-86d4a357e8d6'),
('formal_proposals','434cf45b-d87d-4dbe-a9c3-39932d617f96','client_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','3b0ba0e4-8d85-4057-8e74-60e1d929c70a','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:3b0ba0e4-8d85-4057-8e74-60e1d929c70a'),
('formal_proposals','434cf45b-d87d-4dbe-a9c3-39932d617f96','issuer_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','0f2c2057-5aae-434c-906a-a2013c35a528','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:0f2c2057-5aae-434c-906a-a2013c35a528'),
('formal_proposals','43500f57-3142-4992-8c9e-1f545ee24859','client_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','67427bfb-cea2-4fa4-892e-5144feb91896','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:67427bfb-cea2-4fa4-892e-5144feb91896'),
('formal_proposals','43500f57-3142-4992-8c9e-1f545ee24859','issuer_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','0f2c2057-5aae-434c-906a-a2013c35a528','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:0f2c2057-5aae-434c-906a-a2013c35a528'),
('formal_proposals','4949b898-79bf-4568-9f89-1f856053aa51','issuer_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','bc7674ce-d1a7-42ed-abcc-f2f079bf34de','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:bc7674ce-d1a7-42ed-abcc-f2f079bf34de'),
('formal_proposals','4a8813d4-9fbc-4371-a300-6dbda65b68fb','client_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','12a062f9-8883-44e6-8ffb-c5b9be3b5d5f','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:12a062f9-8883-44e6-8ffb-c5b9be3b5d5f'),
('formal_proposals','4a8813d4-9fbc-4371-a300-6dbda65b68fb','issuer_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','0f2c2057-5aae-434c-906a-a2013c35a528','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:0f2c2057-5aae-434c-906a-a2013c35a528'),
('formal_proposals','50757e26-3e8e-4ce5-ad4e-415a7f39df39','client_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','5c3da1d4-93ee-4c0d-b9cd-060edf61ae34','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:5c3da1d4-93ee-4c0d-b9cd-060edf61ae34'),
('formal_proposals','50757e26-3e8e-4ce5-ad4e-415a7f39df39','issuer_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','0f2c2057-5aae-434c-906a-a2013c35a528','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:0f2c2057-5aae-434c-906a-a2013c35a528'),
('formal_proposals','55cde245-561e-4b60-926a-613480bb0cdd','client_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','c9418e5d-a540-4610-bd91-954a6344e61b','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:c9418e5d-a540-4610-bd91-954a6344e61b'),
('formal_proposals','55cde245-561e-4b60-926a-613480bb0cdd','issuer_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','0f2c2057-5aae-434c-906a-a2013c35a528','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:0f2c2057-5aae-434c-906a-a2013c35a528'),
('formal_proposals','63aa357d-aef9-428a-a680-9776c7202188','client_logo_id','b0e92d15-2e87-4c1a-93ac-3399bf8fe515','b149275b-3d2f-4cdf-91a9-2e226d9214d3','crm-legacy-logo:b0e92d15-2e87-4c1a-93ac-3399bf8fe515:b149275b-3d2f-4cdf-91a9-2e226d9214d3'),
('formal_proposals','63aa357d-aef9-428a-a680-9776c7202188','issuer_logo_id','b0e92d15-2e87-4c1a-93ac-3399bf8fe515','bc7674ce-d1a7-42ed-abcc-f2f079bf34de','crm-legacy-logo:b0e92d15-2e87-4c1a-93ac-3399bf8fe515:bc7674ce-d1a7-42ed-abcc-f2f079bf34de'),
('formal_proposals','6813fc5b-168c-45e0-99a1-c2fdfb1bcb15','client_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','24a03057-fe39-4dc2-97f5-026a14f3cadb','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:24a03057-fe39-4dc2-97f5-026a14f3cadb'),
('formal_proposals','6813fc5b-168c-45e0-99a1-c2fdfb1bcb15','issuer_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','0f2c2057-5aae-434c-906a-a2013c35a528','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:0f2c2057-5aae-434c-906a-a2013c35a528'),
('formal_proposals','6c76fac3-0d7c-4145-9846-036a388946a1','issuer_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','0f2c2057-5aae-434c-906a-a2013c35a528','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:0f2c2057-5aae-434c-906a-a2013c35a528'),
('formal_proposals','6d0340fa-dad5-47c7-865d-5cf2058b47db','client_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','741be125-3b36-4b97-aa9b-6d4302c8e5c0','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:741be125-3b36-4b97-aa9b-6d4302c8e5c0'),
('formal_proposals','6d0340fa-dad5-47c7-865d-5cf2058b47db','issuer_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','0f2c2057-5aae-434c-906a-a2013c35a528','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:0f2c2057-5aae-434c-906a-a2013c35a528'),
('formal_proposals','708bcd57-9cb0-4b9e-95ec-31e5659dba5b','client_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','741be125-3b36-4b97-aa9b-6d4302c8e5c0','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:741be125-3b36-4b97-aa9b-6d4302c8e5c0'),
('formal_proposals','708bcd57-9cb0-4b9e-95ec-31e5659dba5b','issuer_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','0f2c2057-5aae-434c-906a-a2013c35a528','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:0f2c2057-5aae-434c-906a-a2013c35a528'),
('formal_proposals','72e6bc11-8035-4978-8045-8120c1062695','issuer_logo_id','389b6cc1-2f8d-4fe4-bc3d-f50f92df3157','0f2c2057-5aae-434c-906a-a2013c35a528','crm-legacy-logo:389b6cc1-2f8d-4fe4-bc3d-f50f92df3157:0f2c2057-5aae-434c-906a-a2013c35a528'),
('formal_proposals','75dc517a-f5f3-49d1-99ed-d133f6d19392','client_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','741be125-3b36-4b97-aa9b-6d4302c8e5c0','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:741be125-3b36-4b97-aa9b-6d4302c8e5c0'),
('formal_proposals','75dc517a-f5f3-49d1-99ed-d133f6d19392','issuer_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','0f2c2057-5aae-434c-906a-a2013c35a528','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:0f2c2057-5aae-434c-906a-a2013c35a528'),
('formal_proposals','75e90386-6ffc-4cfd-b4d2-73ff573b37f9','issuer_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','0f2c2057-5aae-434c-906a-a2013c35a528','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:0f2c2057-5aae-434c-906a-a2013c35a528'),
('formal_proposals','76459441-baf8-430a-9205-285567e3b77c','issuer_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','52e3d239-9e0b-4789-ad87-86d4a357e8d6','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:52e3d239-9e0b-4789-ad87-86d4a357e8d6'),
('formal_proposals','76e9b35f-1fa2-486e-bd17-13122b26912a','client_logo_id','b0e92d15-2e87-4c1a-93ac-3399bf8fe515','ef8a58f1-326d-43b9-8fef-7113a1199ad4','crm-legacy-logo:b0e92d15-2e87-4c1a-93ac-3399bf8fe515:ef8a58f1-326d-43b9-8fef-7113a1199ad4'),
('formal_proposals','76e9b35f-1fa2-486e-bd17-13122b26912a','issuer_logo_id','b0e92d15-2e87-4c1a-93ac-3399bf8fe515','bc7674ce-d1a7-42ed-abcc-f2f079bf34de','crm-legacy-logo:b0e92d15-2e87-4c1a-93ac-3399bf8fe515:bc7674ce-d1a7-42ed-abcc-f2f079bf34de'),
('formal_proposals','7ed504a1-e5c8-4cc6-ba19-4ace258a8c42','client_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','2a9dfb5d-39ea-4f57-96b4-6889ba3abc16','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:2a9dfb5d-39ea-4f57-96b4-6889ba3abc16'),
('formal_proposals','7ed504a1-e5c8-4cc6-ba19-4ace258a8c42','issuer_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','bc7674ce-d1a7-42ed-abcc-f2f079bf34de','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:bc7674ce-d1a7-42ed-abcc-f2f079bf34de'),
('formal_proposals','7f7ebc16-3340-4c43-8f81-fbec5196a73a','client_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','6cceb151-4963-4ced-a656-f678f50f851e','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:6cceb151-4963-4ced-a656-f678f50f851e'),
('formal_proposals','7f7ebc16-3340-4c43-8f81-fbec5196a73a','issuer_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','0f2c2057-5aae-434c-906a-a2013c35a528','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:0f2c2057-5aae-434c-906a-a2013c35a528'),
('formal_proposals','7ff48290-84b9-456a-8414-159a7a39c7ca','client_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','53c268f2-179b-42eb-bf9f-e7b5fd690fbf','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:53c268f2-179b-42eb-bf9f-e7b5fd690fbf'),
('formal_proposals','7ff48290-84b9-456a-8414-159a7a39c7ca','issuer_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','0f2c2057-5aae-434c-906a-a2013c35a528','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:0f2c2057-5aae-434c-906a-a2013c35a528'),
('formal_proposals','84461e3f-81db-4129-8628-fdcaafbeb9d2','issuer_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','0f2c2057-5aae-434c-906a-a2013c35a528','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:0f2c2057-5aae-434c-906a-a2013c35a528'),
('formal_proposals','8666343f-a6cb-458e-88ce-4ec83e0990c3','client_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','741be125-3b36-4b97-aa9b-6d4302c8e5c0','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:741be125-3b36-4b97-aa9b-6d4302c8e5c0'),
('formal_proposals','8666343f-a6cb-458e-88ce-4ec83e0990c3','issuer_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','0f2c2057-5aae-434c-906a-a2013c35a528','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:0f2c2057-5aae-434c-906a-a2013c35a528'),
('formal_proposals','870d1c8d-fd1c-4935-8afc-92c0f550c7cb','issuer_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','bc7674ce-d1a7-42ed-abcc-f2f079bf34de','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:bc7674ce-d1a7-42ed-abcc-f2f079bf34de'),
('formal_proposals','8844bcce-78c7-46f5-82cc-f972ff6735bb','issuer_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','bc7674ce-d1a7-42ed-abcc-f2f079bf34de','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:bc7674ce-d1a7-42ed-abcc-f2f079bf34de'),
('formal_proposals','8a5782b0-8901-444e-a842-ff1729539f45','issuer_logo_id','389b6cc1-2f8d-4fe4-bc3d-f50f92df3157','52e3d239-9e0b-4789-ad87-86d4a357e8d6','crm-legacy-logo:389b6cc1-2f8d-4fe4-bc3d-f50f92df3157:52e3d239-9e0b-4789-ad87-86d4a357e8d6'),
('formal_proposals','8f688a25-b3be-44ca-9310-e003df66059e','client_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','14d87492-239a-4cee-9352-c06491d0094a','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:14d87492-239a-4cee-9352-c06491d0094a'),
('formal_proposals','8f688a25-b3be-44ca-9310-e003df66059e','issuer_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','0f2c2057-5aae-434c-906a-a2013c35a528','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:0f2c2057-5aae-434c-906a-a2013c35a528'),
('formal_proposals','92efa9d6-2e93-4b27-b800-ae6c2bfc94a9','issuer_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','0f2c2057-5aae-434c-906a-a2013c35a528','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:0f2c2057-5aae-434c-906a-a2013c35a528'),
('formal_proposals','93e725a4-6a5d-436b-8868-b097005517c1','client_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','741be125-3b36-4b97-aa9b-6d4302c8e5c0','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:741be125-3b36-4b97-aa9b-6d4302c8e5c0'),
('formal_proposals','93e725a4-6a5d-436b-8868-b097005517c1','issuer_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','0f2c2057-5aae-434c-906a-a2013c35a528','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:0f2c2057-5aae-434c-906a-a2013c35a528'),
('formal_proposals','991eea27-18cc-4ea0-b8d7-42a2ae5f4fd7','client_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','741be125-3b36-4b97-aa9b-6d4302c8e5c0','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:741be125-3b36-4b97-aa9b-6d4302c8e5c0'),
('formal_proposals','991eea27-18cc-4ea0-b8d7-42a2ae5f4fd7','issuer_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','0f2c2057-5aae-434c-906a-a2013c35a528','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:0f2c2057-5aae-434c-906a-a2013c35a528'),
('formal_proposals','a1b0b93f-024c-4377-a979-42dca8ee86a0','issuer_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','0f2c2057-5aae-434c-906a-a2013c35a528','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:0f2c2057-5aae-434c-906a-a2013c35a528'),
('formal_proposals','a33748ea-d8b3-440e-9695-c644ef1c8159','client_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','6ee2f5aa-ad7f-4fc9-8270-408550735e2f','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:6ee2f5aa-ad7f-4fc9-8270-408550735e2f'),
('formal_proposals','a33748ea-d8b3-440e-9695-c644ef1c8159','issuer_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','0f2c2057-5aae-434c-906a-a2013c35a528','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:0f2c2057-5aae-434c-906a-a2013c35a528'),
('formal_proposals','a5f84849-ad04-443b-9fcb-1a200f8ad5c0','client_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','53c268f2-179b-42eb-bf9f-e7b5fd690fbf','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:53c268f2-179b-42eb-bf9f-e7b5fd690fbf'),
('formal_proposals','a5f84849-ad04-443b-9fcb-1a200f8ad5c0','issuer_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','0f2c2057-5aae-434c-906a-a2013c35a528','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:0f2c2057-5aae-434c-906a-a2013c35a528'),
('formal_proposals','a825ada5-2b1c-445e-b729-ed1efc0d0b03','client_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','c2106764-d553-4da5-b9bd-d0ca9ce1e4a5','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:c2106764-d553-4da5-b9bd-d0ca9ce1e4a5'),
('formal_proposals','a825ada5-2b1c-445e-b729-ed1efc0d0b03','issuer_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','0f2c2057-5aae-434c-906a-a2013c35a528','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:0f2c2057-5aae-434c-906a-a2013c35a528'),
('formal_proposals','a82d85a1-3c79-4a3a-a426-ee2e3ed1ce11','issuer_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','4f64c340-57c5-40d0-8a09-63a18e245c17','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:4f64c340-57c5-40d0-8a09-63a18e245c17'),
('formal_proposals','ab880cca-7e97-4bda-b934-406806ed064c','issuer_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','0f2c2057-5aae-434c-906a-a2013c35a528','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:0f2c2057-5aae-434c-906a-a2013c35a528'),
('formal_proposals','adb004c8-78ae-4255-8b88-b92373f16d93','issuer_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','bc7674ce-d1a7-42ed-abcc-f2f079bf34de','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:bc7674ce-d1a7-42ed-abcc-f2f079bf34de'),
('formal_proposals','ae81c1be-0720-4b13-b1ca-ea9a6a754f87','client_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','818ff950-f764-4441-8a50-0ebd7ff8485a','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:818ff950-f764-4441-8a50-0ebd7ff8485a'),
('formal_proposals','ae81c1be-0720-4b13-b1ca-ea9a6a754f87','issuer_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','bc7674ce-d1a7-42ed-abcc-f2f079bf34de','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:bc7674ce-d1a7-42ed-abcc-f2f079bf34de'),
('formal_proposals','b34d173a-3d06-4d56-92f4-0fe1281f72af','issuer_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','347c244d-04bd-4a73-92f6-dd85c5bf2ed7','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:347c244d-04bd-4a73-92f6-dd85c5bf2ed7'),
('formal_proposals','b4c93726-5abb-4ef1-9929-e0b30a65299b','client_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','e237f09e-0ae6-402f-9b6d-ad1e56d790cb','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:e237f09e-0ae6-402f-9b6d-ad1e56d790cb'),
('formal_proposals','b4c93726-5abb-4ef1-9929-e0b30a65299b','issuer_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','0f2c2057-5aae-434c-906a-a2013c35a528','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:0f2c2057-5aae-434c-906a-a2013c35a528'),
('formal_proposals','b63262b4-6e99-456b-a1b4-210c1f9ef2aa','client_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','24db1f00-e2d3-44f0-804d-a5c471be4ee4','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:24db1f00-e2d3-44f0-804d-a5c471be4ee4'),
('formal_proposals','b63262b4-6e99-456b-a1b4-210c1f9ef2aa','issuer_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','0f2c2057-5aae-434c-906a-a2013c35a528','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:0f2c2057-5aae-434c-906a-a2013c35a528'),
('formal_proposals','b9911664-2575-435c-ae99-1fd0b81a536e','issuer_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','0f2c2057-5aae-434c-906a-a2013c35a528','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:0f2c2057-5aae-434c-906a-a2013c35a528'),
('formal_proposals','bab68529-bfa6-4127-b195-1fdcfee733a7','client_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','65bcc8b9-b6bf-4db1-88a6-ac4de81906f6','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:65bcc8b9-b6bf-4db1-88a6-ac4de81906f6'),
('formal_proposals','bab68529-bfa6-4127-b195-1fdcfee733a7','issuer_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','0f2c2057-5aae-434c-906a-a2013c35a528','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:0f2c2057-5aae-434c-906a-a2013c35a528'),
('formal_proposals','bdb97964-b706-4f6f-a877-80edbbcf798a','client_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','f1a4e491-ed03-4992-8056-7c8353ec044f','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:f1a4e491-ed03-4992-8056-7c8353ec044f'),
('formal_proposals','bdb97964-b706-4f6f-a877-80edbbcf798a','issuer_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','0f2c2057-5aae-434c-906a-a2013c35a528','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:0f2c2057-5aae-434c-906a-a2013c35a528'),
('formal_proposals','bed4ea62-4b96-465a-becf-4c3183a99135','client_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','35e4af9c-c7f8-429d-9061-3219eccc88ee','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:35e4af9c-c7f8-429d-9061-3219eccc88ee'),
('formal_proposals','bed4ea62-4b96-465a-becf-4c3183a99135','issuer_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','0f2c2057-5aae-434c-906a-a2013c35a528','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:0f2c2057-5aae-434c-906a-a2013c35a528'),
('formal_proposals','c08f9bd2-e4c8-48ae-aabc-1dcd5582962c','client_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','f740b66a-e31c-4cbf-9f06-9a5165432623','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:f740b66a-e31c-4cbf-9f06-9a5165432623'),
('formal_proposals','c08f9bd2-e4c8-48ae-aabc-1dcd5582962c','issuer_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','0f2c2057-5aae-434c-906a-a2013c35a528','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:0f2c2057-5aae-434c-906a-a2013c35a528'),
('formal_proposals','c7716d81-b108-4dc4-8fd4-e29e65e21de8','client_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','533d715d-17ab-467b-97a0-9f3be808228b','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:533d715d-17ab-467b-97a0-9f3be808228b'),
('formal_proposals','c7716d81-b108-4dc4-8fd4-e29e65e21de8','issuer_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','0f2c2057-5aae-434c-906a-a2013c35a528','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:0f2c2057-5aae-434c-906a-a2013c35a528'),
('formal_proposals','cac59463-6e10-4719-b2e9-06f507b32e47','client_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','12dfafa6-b49b-4a38-b45e-95cd115bcb0b','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:12dfafa6-b49b-4a38-b45e-95cd115bcb0b'),
('formal_proposals','cac59463-6e10-4719-b2e9-06f507b32e47','issuer_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','0f2c2057-5aae-434c-906a-a2013c35a528','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:0f2c2057-5aae-434c-906a-a2013c35a528'),
('formal_proposals','ccec2aca-e17d-4ab7-8ed3-30c3db4bdd9e','client_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','9438f8b0-7460-428f-ab71-3006a7012677','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:9438f8b0-7460-428f-ab71-3006a7012677'),
('formal_proposals','ccec2aca-e17d-4ab7-8ed3-30c3db4bdd9e','issuer_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','4f64c340-57c5-40d0-8a09-63a18e245c17','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:4f64c340-57c5-40d0-8a09-63a18e245c17'),
('formal_proposals','cd17e20f-742b-427f-8be5-e650bdc1caae','client_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','17a98a3b-cf6f-4542-a411-a36bfb4cea46','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:17a98a3b-cf6f-4542-a411-a36bfb4cea46'),
('formal_proposals','cd17e20f-742b-427f-8be5-e650bdc1caae','issuer_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','0f2c2057-5aae-434c-906a-a2013c35a528','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:0f2c2057-5aae-434c-906a-a2013c35a528'),
('formal_proposals','ceba58d3-8059-464e-bb37-63ba253bcc14','client_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','44e62792-350a-45c4-b041-2095c2a015e8','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:44e62792-350a-45c4-b041-2095c2a015e8'),
('formal_proposals','ceba58d3-8059-464e-bb37-63ba253bcc14','issuer_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','0f2c2057-5aae-434c-906a-a2013c35a528','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:0f2c2057-5aae-434c-906a-a2013c35a528'),
('formal_proposals','d2922884-2ac0-4599-b295-b99303668e2a','client_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','741be125-3b36-4b97-aa9b-6d4302c8e5c0','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:741be125-3b36-4b97-aa9b-6d4302c8e5c0'),
('formal_proposals','d2922884-2ac0-4599-b295-b99303668e2a','issuer_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','0f2c2057-5aae-434c-906a-a2013c35a528','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:0f2c2057-5aae-434c-906a-a2013c35a528'),
('formal_proposals','d6a3747c-0571-4094-ae7f-07ee5ad82a35','client_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','19e3c64d-099c-4b8d-838c-f6a5e4433d43','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:19e3c64d-099c-4b8d-838c-f6a5e4433d43'),
('formal_proposals','d6a3747c-0571-4094-ae7f-07ee5ad82a35','issuer_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','4f64c340-57c5-40d0-8a09-63a18e245c17','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:4f64c340-57c5-40d0-8a09-63a18e245c17'),
('formal_proposals','d84c63ca-8f34-4771-815e-94e33d6a57f6','client_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','bb53483c-93c2-4a8c-b249-ddaabc78181f','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:bb53483c-93c2-4a8c-b249-ddaabc78181f'),
('formal_proposals','d84c63ca-8f34-4771-815e-94e33d6a57f6','issuer_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','0f2c2057-5aae-434c-906a-a2013c35a528','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:0f2c2057-5aae-434c-906a-a2013c35a528'),
('formal_proposals','da3a93a6-c559-4d1a-91bc-e84df8f11d45','issuer_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','0f2c2057-5aae-434c-906a-a2013c35a528','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:0f2c2057-5aae-434c-906a-a2013c35a528'),
('formal_proposals','dd203a16-e021-4884-964d-def3824ffa41','issuer_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','bc7674ce-d1a7-42ed-abcc-f2f079bf34de','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:bc7674ce-d1a7-42ed-abcc-f2f079bf34de'),
('formal_proposals','ddd6b9c6-91cd-4c8c-bae7-b95e98be15ab','issuer_logo_id','b0e92d15-2e87-4c1a-93ac-3399bf8fe515','52e3d239-9e0b-4789-ad87-86d4a357e8d6','crm-legacy-logo:b0e92d15-2e87-4c1a-93ac-3399bf8fe515:52e3d239-9e0b-4789-ad87-86d4a357e8d6'),
('formal_proposals','e29369da-0bdc-4a83-9f47-eb6dbddc9afb','client_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','47a6f43c-4fcd-4800-8c5d-62661745fe81','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:47a6f43c-4fcd-4800-8c5d-62661745fe81'),
('formal_proposals','e29369da-0bdc-4a83-9f47-eb6dbddc9afb','issuer_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','4f64c340-57c5-40d0-8a09-63a18e245c17','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:4f64c340-57c5-40d0-8a09-63a18e245c17'),
('formal_proposals','ee0675dc-b843-4a53-b084-4b75ee8637b2','issuer_logo_id','389b6cc1-2f8d-4fe4-bc3d-f50f92df3157','0f2c2057-5aae-434c-906a-a2013c35a528','crm-legacy-logo:389b6cc1-2f8d-4fe4-bc3d-f50f92df3157:0f2c2057-5aae-434c-906a-a2013c35a528'),
('formal_proposals','f92ef348-76ae-4ee0-b25a-cd1532a20ee7','issuer_logo_id','7ee39632-74ea-4fee-a3cb-c028e87cecfc','bc7674ce-d1a7-42ed-abcc-f2f079bf34de','crm-legacy-logo:7ee39632-74ea-4fee-a3cb-c028e87cecfc:bc7674ce-d1a7-42ed-abcc-f2f079bf34de'),
('formal_proposals','fe82e4ed-5037-4969-94de-dffcc4a40597','issuer_logo_id','b0e92d15-2e87-4c1a-93ac-3399bf8fe515','52e3d239-9e0b-4789-ad87-86d4a357e8d6','crm-legacy-logo:b0e92d15-2e87-4c1a-93ac-3399bf8fe515:52e3d239-9e0b-4789-ad87-86d4a357e8d6');
-- statement-breakpoint
CREATE TABLE IF NOT EXISTS legacy_logo_tenant_copies(source_logo_id text NOT NULL,tenant_id text NOT NULL,
      copy_logo_id text UNIQUE NOT NULL,source_hash text NOT NULL,rule text NOT NULL,
      recorded_at timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(source_logo_id,tenant_id));
-- statement-breakpoint
CREATE TABLE IF NOT EXISTS legacy_logo_reference_repairs(parent_table text NOT NULL,parent_id text NOT NULL,
      field text NOT NULL,tenant_id text NOT NULL,previous_logo_id text NOT NULL,assigned_logo_id text NOT NULL,
      rule text NOT NULL,recorded_at timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(parent_table,parent_id,field));
-- statement-breakpoint
DO $$ BEGIN
      IF EXISTS(SELECT 1 FROM crm_logo_copy_manifest m LEFT JOIN company_logos s ON s.logo_id=m.source_logo_id
        LEFT JOIN tenants t ON t.tenant_id=m.tenant_id
        WHERE s.logo_id IS NULL OR s.tenant_id IS NOT NULL OR t.tenant_id IS NULL
          OR md5(to_jsonb(s)::text) IS DISTINCT FROM m.source_hash)
      THEN RAISE EXCEPTION 'Logo source manifest changed; no repair applied'; END IF;
      IF EXISTS(SELECT 1 FROM crm_logo_copy_manifest m JOIN company_logos s ON s.logo_id=m.source_logo_id
        LEFT JOIN company_logos c ON c.logo_id=m.copy_logo_id
        LEFT JOIN legacy_logo_tenant_copies a ON a.source_logo_id=m.source_logo_id AND a.tenant_id=m.tenant_id
        WHERE (c.logo_id IS NULL) IS DISTINCT FROM (a.copy_logo_id IS NULL)
          OR (c.logo_id IS NOT NULL AND to_jsonb(c) IS DISTINCT FROM
            (to_jsonb(s)||jsonb_build_object('logo_id',m.copy_logo_id,'tenant_id',m.tenant_id,'is_default',false)))
          OR (a.copy_logo_id IS NOT NULL AND (a.copy_logo_id IS DISTINCT FROM m.copy_logo_id
            OR a.source_hash IS DISTINCT FROM m.source_hash OR a.rule IS DISTINCT FROM 'exact_parent_tenant_copy')))
      THEN RAISE EXCEPTION 'Logo copy or audit conflict; no repair applied'; END IF;
      IF EXISTS(SELECT 1 FROM crm_logo_ref_manifest m LEFT JOIN (SELECT 'formal_proposals'::text AS parent_table,proposal_doc_id AS parent_id,
    'issuer_logo_id'::text AS field,tenant_id,issuer_logo_id AS logo_id FROM formal_proposals
    UNION ALL SELECT 'formal_proposals',proposal_doc_id,'client_logo_id',tenant_id,client_logo_id FROM formal_proposals
    UNION ALL SELECT 'clients',client_id,'client_logo_id',tenant_id,client_logo_id FROM clients) r
        ON r.parent_table=m.parent_table AND r.parent_id=m.parent_id AND r.field=m.field
        LEFT JOIN legacy_logo_reference_repairs a
        ON a.parent_table=m.parent_table AND a.parent_id=m.parent_id AND a.field=m.field
        WHERE r.parent_id IS NULL OR r.tenant_id IS DISTINCT FROM m.tenant_id
          OR r.logo_id IS NULL OR r.logo_id NOT IN (m.source_logo_id,m.copy_logo_id)
          OR (r.logo_id=m.copy_logo_id AND a.parent_id IS NULL)
          OR (a.parent_id IS NOT NULL AND (a.tenant_id IS DISTINCT FROM m.tenant_id
            OR a.previous_logo_id IS DISTINCT FROM m.source_logo_id OR a.assigned_logo_id IS DISTINCT FROM m.copy_logo_id
            OR a.rule IS DISTINCT FROM 'exact_parent_tenant_copy')))
      THEN RAISE EXCEPTION 'Logo reference or audit conflict; no repair applied'; END IF;
    END $$;
-- statement-breakpoint
INSERT INTO company_logos(logo_id,logo_name,logo_type,company_name,logo_data,logo_format,uploaded_at,is_default,tenant_id)
      SELECT m.copy_logo_id,s.logo_name,s.logo_type,s.company_name,s.logo_data,s.logo_format,s.uploaded_at,false,m.tenant_id
      FROM crm_logo_copy_manifest m JOIN company_logos s ON s.logo_id=m.source_logo_id
      WHERE NOT EXISTS(SELECT 1 FROM company_logos c WHERE c.logo_id=m.copy_logo_id);
-- statement-breakpoint
INSERT INTO legacy_logo_tenant_copies(source_logo_id,tenant_id,copy_logo_id,source_hash,rule)
      SELECT source_logo_id,tenant_id,copy_logo_id,source_hash,'exact_parent_tenant_copy' FROM crm_logo_copy_manifest
      ON CONFLICT(source_logo_id,tenant_id) DO NOTHING;
-- statement-breakpoint
INSERT INTO legacy_logo_reference_repairs(parent_table,parent_id,field,tenant_id,previous_logo_id,assigned_logo_id,rule)
      SELECT parent_table,parent_id,field,tenant_id,source_logo_id,copy_logo_id,'exact_parent_tenant_copy' FROM crm_logo_ref_manifest
      ON CONFLICT(parent_table,parent_id,field) DO NOTHING;
-- statement-breakpoint
UPDATE formal_proposals p SET issuer_logo_id=m.copy_logo_id FROM crm_logo_ref_manifest m
        WHERE m.parent_table='formal_proposals' AND m.field='issuer_logo_id' AND p.proposal_doc_id=m.parent_id
          AND p.tenant_id=m.tenant_id AND p.issuer_logo_id=m.source_logo_id;
-- statement-breakpoint
UPDATE formal_proposals p SET client_logo_id=m.copy_logo_id FROM crm_logo_ref_manifest m
        WHERE m.parent_table='formal_proposals' AND m.field='client_logo_id' AND p.proposal_doc_id=m.parent_id
          AND p.tenant_id=m.tenant_id AND p.client_logo_id=m.source_logo_id;
-- statement-breakpoint
UPDATE clients p SET client_logo_id=m.copy_logo_id FROM crm_logo_ref_manifest m
        WHERE m.parent_table='clients' AND m.field='client_logo_id' AND p.client_id=m.parent_id
          AND p.tenant_id=m.tenant_id AND p.client_logo_id=m.source_logo_id;
-- statement-breakpoint
DO $$ BEGIN
      IF EXISTS(SELECT 1 FROM crm_logo_copy_manifest m JOIN company_logos s ON s.logo_id=m.source_logo_id
        LEFT JOIN company_logos c ON c.logo_id=m.copy_logo_id
        WHERE c.logo_id IS NULL OR to_jsonb(c) IS DISTINCT FROM
          (to_jsonb(s)||jsonb_build_object('logo_id',m.copy_logo_id,'tenant_id',m.tenant_id,'is_default',false)))
      THEN RAISE EXCEPTION 'Logo copy content postcondition failed'; END IF;
      IF EXISTS(SELECT 1 FROM crm_logo_ref_manifest m LEFT JOIN (SELECT 'formal_proposals'::text AS parent_table,proposal_doc_id AS parent_id,
    'issuer_logo_id'::text AS field,tenant_id,issuer_logo_id AS logo_id FROM formal_proposals
    UNION ALL SELECT 'formal_proposals',proposal_doc_id,'client_logo_id',tenant_id,client_logo_id FROM formal_proposals
    UNION ALL SELECT 'clients',client_id,'client_logo_id',tenant_id,client_logo_id FROM clients) r
        ON r.parent_table=m.parent_table AND r.parent_id=m.parent_id AND r.field=m.field
        WHERE r.parent_id IS NULL OR r.tenant_id IS DISTINCT FROM m.tenant_id OR r.logo_id IS DISTINCT FROM m.copy_logo_id)
      THEN RAISE EXCEPTION 'Logo reference postcondition failed'; END IF;
      IF EXISTS(SELECT 1 FROM (SELECT 'formal_proposals'::text AS parent_table,proposal_doc_id AS parent_id,
    'issuer_logo_id'::text AS field,tenant_id,issuer_logo_id AS logo_id FROM formal_proposals
    UNION ALL SELECT 'formal_proposals',proposal_doc_id,'client_logo_id',tenant_id,client_logo_id FROM formal_proposals
    UNION ALL SELECT 'clients',client_id,'client_logo_id',tenant_id,client_logo_id FROM clients) r JOIN tenants t ON t.tenant_id=r.tenant_id
        JOIN company_logos l ON l.logo_id=r.logo_id WHERE l.tenant_id IS NULL)
      THEN RAISE EXCEPTION 'Unlisted global logo reference remains; refresh manifest'; END IF;
    END $$;
-- statement-breakpoint
SELECT (SELECT count(*) FROM crm_logo_copy_manifest) AS copies_verified,
      (SELECT count(*) FROM crm_logo_ref_manifest) AS references_verified;
COMMIT;
