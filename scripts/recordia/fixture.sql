-- Synthetic fixtures for a disposable PostgreSQL engine only.
CREATE TABLE opportunities(opportunity_id text PRIMARY KEY,tenant_id text,title text,stage text,created_at timestamp,closed_at timestamp);
    CREATE TABLE quotes(quote_id text PRIMARY KEY,tenant_id text,opportunity_id text,created_at timestamp,client_name text,status text);
    CREATE TABLE proposals(proposal_id text PRIMARY KEY,tenant_id text,opportunity_id text,origin text,status text,invoice_xml_base64 text,created_at timestamp);
    CREATE TABLE interaction_logs(interaction_id text PRIMARY KEY,tenant_id text,opportunity_id text,note text,created_by_user_id text,created_at timestamp);
    CREATE TABLE proposal_audit_events(event_id text PRIMARY KEY,tenant_id text,proposal_id text,payload text,created_at timestamp);
    CREATE TABLE proposal_approvals(approval_id text PRIMARY KEY,tenant_id text,proposal_id text,decision text,created_at timestamp);
    CREATE TABLE quote_lines(line_id text PRIMARY KEY,quote_id text,description_final text,final_price_unit numeric,created_at timestamp);
    CREATE TABLE formal_proposals(proposal_doc_id text PRIMARY KEY,tenant_id text,proposal_id text,quote_id text,pdf_file_data bytea,created_at timestamp);
    CREATE TABLE proposal_items(item_id text PRIMARY KEY,tenant_id text,proposal_id text,description text,price_unit numeric,created_at timestamp);
    CREATE TABLE tasks(task_id text PRIMARY KEY,tenant_id text,opportunity_id text,description text,completed_at timestamp,created_at timestamp);
    INSERT INTO opportunities VALUES('case-a','389b6cc1-2f8d-4fe4-bc3d-f50f92df3157','Original title','open','2026-01-01',NULL),('foreign-case','other','Other company','open',now(),NULL);
    INSERT INTO quotes VALUES('quote-a','389b6cc1-2f8d-4fe4-bc3d-f50f92df3157','case-a','2026-01-01','Synthetic','draft'),('foreign-quote','other','foreign-case',now(),'Private other company','draft');
    INSERT INTO proposals VALUES('proposal-a','389b6cc1-2f8d-4fe4-bc3d-f50f92df3157',NULL,'quote-a','draft','c3ludGhldGlj',now());
    INSERT INTO interaction_logs VALUES('note-a','389b6cc1-2f8d-4fe4-bc3d-f50f92df3157','case-a','Original note','original-author',now());
    INSERT INTO quote_lines VALUES('line-a','quote-a','Old product',123.123456789123456789,now()),('foreign-line','foreign-quote','Other company content',9,now());
    INSERT INTO formal_proposals VALUES('doc-a','389b6cc1-2f8d-4fe4-bc3d-f50f92df3157','proposal-a','quote-a',decode('abcd','hex'),now());
