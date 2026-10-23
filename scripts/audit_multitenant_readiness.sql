-- Read-only release reconciliation. Run on the explicitly selected branch.
-- Counts flag evidence to review; nullable/global/legacy rows are not reassigned.
SELECT * FROM (
SELECT 'app_users.rows' AS check_name, (SELECT count(*) FROM app_users)::bigint AS count
UNION ALL
SELECT 'app_users.tenant_missing' AS check_name, (SELECT count(*) FROM app_users WHERE tenant_id IS NULL)::bigint AS count
UNION ALL
SELECT 'app_users.tenant_unknown' AS check_name, (SELECT count(*) FROM app_users c LEFT JOIN tenants t ON t.tenant_id=c.tenant_id WHERE c.tenant_id IS NOT NULL AND t.tenant_id IS NULL)::bigint AS count
UNION ALL
SELECT 'clients.rows' AS check_name, (SELECT count(*) FROM clients)::bigint AS count
UNION ALL
SELECT 'clients.tenant_missing' AS check_name, (SELECT count(*) FROM clients WHERE tenant_id IS NULL)::bigint AS count
UNION ALL
SELECT 'clients.tenant_unknown' AS check_name, (SELECT count(*) FROM clients c LEFT JOIN tenants t ON t.tenant_id=c.tenant_id WHERE c.tenant_id IS NOT NULL AND t.tenant_id IS NULL)::bigint AS count
UNION ALL
SELECT 'client_contacts.rows' AS check_name, (SELECT count(*) FROM client_contacts)::bigint AS count
UNION ALL
SELECT 'client_contacts.tenant_missing' AS check_name, (SELECT count(*) FROM client_contacts WHERE tenant_id IS NULL)::bigint AS count
UNION ALL
SELECT 'client_contacts.tenant_unknown' AS check_name, (SELECT count(*) FROM client_contacts c LEFT JOIN tenants t ON t.tenant_id=c.tenant_id WHERE c.tenant_id IS NOT NULL AND t.tenant_id IS NULL)::bigint AS count
UNION ALL
SELECT 'opportunities.rows' AS check_name, (SELECT count(*) FROM opportunities)::bigint AS count
UNION ALL
SELECT 'opportunities.tenant_missing' AS check_name, (SELECT count(*) FROM opportunities WHERE tenant_id IS NULL)::bigint AS count
UNION ALL
SELECT 'opportunities.tenant_unknown' AS check_name, (SELECT count(*) FROM opportunities c LEFT JOIN tenants t ON t.tenant_id=c.tenant_id WHERE c.tenant_id IS NOT NULL AND t.tenant_id IS NULL)::bigint AS count
UNION ALL
SELECT 'tasks.rows' AS check_name, (SELECT count(*) FROM tasks)::bigint AS count
UNION ALL
SELECT 'tasks.tenant_missing' AS check_name, (SELECT count(*) FROM tasks WHERE tenant_id IS NULL)::bigint AS count
UNION ALL
SELECT 'tasks.tenant_unknown' AS check_name, (SELECT count(*) FROM tasks c LEFT JOIN tenants t ON t.tenant_id=c.tenant_id WHERE c.tenant_id IS NOT NULL AND t.tenant_id IS NULL)::bigint AS count
UNION ALL
SELECT 'interaction_logs.rows' AS check_name, (SELECT count(*) FROM interaction_logs)::bigint AS count
UNION ALL
SELECT 'interaction_logs.tenant_missing' AS check_name, (SELECT count(*) FROM interaction_logs WHERE tenant_id IS NULL)::bigint AS count
UNION ALL
SELECT 'interaction_logs.tenant_unknown' AS check_name, (SELECT count(*) FROM interaction_logs c LEFT JOIN tenants t ON t.tenant_id=c.tenant_id WHERE c.tenant_id IS NOT NULL AND t.tenant_id IS NULL)::bigint AS count
UNION ALL
SELECT 'quotes.rows' AS check_name, (SELECT count(*) FROM quotes)::bigint AS count
UNION ALL
SELECT 'quotes.tenant_missing' AS check_name, (SELECT count(*) FROM quotes WHERE tenant_id IS NULL)::bigint AS count
UNION ALL
SELECT 'quotes.tenant_unknown' AS check_name, (SELECT count(*) FROM quotes c LEFT JOIN tenants t ON t.tenant_id=c.tenant_id WHERE c.tenant_id IS NOT NULL AND t.tenant_id IS NULL)::bigint AS count
UNION ALL
SELECT 'proposals.rows' AS check_name, (SELECT count(*) FROM proposals)::bigint AS count
UNION ALL
SELECT 'proposals.tenant_missing' AS check_name, (SELECT count(*) FROM proposals WHERE tenant_id IS NULL)::bigint AS count
UNION ALL
SELECT 'proposals.tenant_unknown' AS check_name, (SELECT count(*) FROM proposals c LEFT JOIN tenants t ON t.tenant_id=c.tenant_id WHERE c.tenant_id IS NOT NULL AND t.tenant_id IS NULL)::bigint AS count
UNION ALL
SELECT 'proposal_items.rows' AS check_name, (SELECT count(*) FROM proposal_items)::bigint AS count
UNION ALL
SELECT 'proposal_items.tenant_missing' AS check_name, (SELECT count(*) FROM proposal_items WHERE tenant_id IS NULL)::bigint AS count
UNION ALL
SELECT 'proposal_items.tenant_unknown' AS check_name, (SELECT count(*) FROM proposal_items c LEFT JOIN tenants t ON t.tenant_id=c.tenant_id WHERE c.tenant_id IS NOT NULL AND t.tenant_id IS NULL)::bigint AS count
UNION ALL
SELECT 'formal_proposals.rows' AS check_name, (SELECT count(*) FROM formal_proposals)::bigint AS count
UNION ALL
SELECT 'formal_proposals.tenant_missing' AS check_name, (SELECT count(*) FROM formal_proposals WHERE tenant_id IS NULL)::bigint AS count
UNION ALL
SELECT 'formal_proposals.tenant_unknown' AS check_name, (SELECT count(*) FROM formal_proposals c LEFT JOIN tenants t ON t.tenant_id=c.tenant_id WHERE c.tenant_id IS NOT NULL AND t.tenant_id IS NULL)::bigint AS count
UNION ALL
SELECT 'proposal_audit_events.rows' AS check_name, (SELECT count(*) FROM proposal_audit_events)::bigint AS count
UNION ALL
SELECT 'proposal_audit_events.tenant_missing' AS check_name, (SELECT count(*) FROM proposal_audit_events WHERE tenant_id IS NULL)::bigint AS count
UNION ALL
SELECT 'proposal_audit_events.tenant_unknown' AS check_name, (SELECT count(*) FROM proposal_audit_events c LEFT JOIN tenants t ON t.tenant_id=c.tenant_id WHERE c.tenant_id IS NOT NULL AND t.tenant_id IS NULL)::bigint AS count
UNION ALL
SELECT 'proposal_approvals.rows' AS check_name, (SELECT count(*) FROM proposal_approvals)::bigint AS count
UNION ALL
SELECT 'proposal_approvals.tenant_missing' AS check_name, (SELECT count(*) FROM proposal_approvals WHERE tenant_id IS NULL)::bigint AS count
UNION ALL
SELECT 'proposal_approvals.tenant_unknown' AS check_name, (SELECT count(*) FROM proposal_approvals c LEFT JOIN tenants t ON t.tenant_id=c.tenant_id WHERE c.tenant_id IS NOT NULL AND t.tenant_id IS NULL)::bigint AS count
UNION ALL
SELECT 'proposal_derivations.rows' AS check_name, (SELECT count(*) FROM proposal_derivations)::bigint AS count
UNION ALL
SELECT 'proposal_derivations.tenant_missing' AS check_name, (SELECT count(*) FROM proposal_derivations WHERE tenant_id IS NULL)::bigint AS count
UNION ALL
SELECT 'proposal_derivations.tenant_unknown' AS check_name, (SELECT count(*) FROM proposal_derivations c LEFT JOIN tenants t ON t.tenant_id=c.tenant_id WHERE c.tenant_id IS NOT NULL AND t.tenant_id IS NULL)::bigint AS count
UNION ALL
SELECT 'proposal_integrated_node.rows' AS check_name, (SELECT count(*) FROM proposal_integrated_node)::bigint AS count
UNION ALL
SELECT 'proposal_integrated_node.tenant_missing' AS check_name, (SELECT count(*) FROM proposal_integrated_node WHERE tenant_id IS NULL)::bigint AS count
UNION ALL
SELECT 'proposal_integrated_node.tenant_unknown' AS check_name, (SELECT count(*) FROM proposal_integrated_node c LEFT JOIN tenants t ON t.tenant_id=c.tenant_id WHERE c.tenant_id IS NOT NULL AND t.tenant_id IS NULL)::bigint AS count
UNION ALL
SELECT 'proposal_profitability_node.rows' AS check_name, (SELECT count(*) FROM proposal_profitability_node)::bigint AS count
UNION ALL
SELECT 'proposal_profitability_node.tenant_missing' AS check_name, (SELECT count(*) FROM proposal_profitability_node WHERE tenant_id IS NULL)::bigint AS count
UNION ALL
SELECT 'proposal_profitability_node.tenant_unknown' AS check_name, (SELECT count(*) FROM proposal_profitability_node c LEFT JOIN tenants t ON t.tenant_id=c.tenant_id WHERE c.tenant_id IS NOT NULL AND t.tenant_id IS NULL)::bigint AS count
UNION ALL
SELECT 'project_expenses.rows' AS check_name, (SELECT count(*) FROM project_expenses)::bigint AS count
UNION ALL
SELECT 'project_expenses.tenant_missing' AS check_name, (SELECT count(*) FROM project_expenses WHERE tenant_id IS NULL)::bigint AS count
UNION ALL
SELECT 'project_expenses.tenant_unknown' AS check_name, (SELECT count(*) FROM project_expenses c LEFT JOIN tenants t ON t.tenant_id=c.tenant_id WHERE c.tenant_id IS NOT NULL AND t.tenant_id IS NULL)::bigint AS count
UNION ALL
SELECT 'packages.rows' AS check_name, (SELECT count(*) FROM packages)::bigint AS count
UNION ALL
SELECT 'packages.tenant_missing' AS check_name, (SELECT count(*) FROM packages WHERE tenant_id IS NULL)::bigint AS count
UNION ALL
SELECT 'packages.tenant_unknown' AS check_name, (SELECT count(*) FROM packages c LEFT JOIN tenants t ON t.tenant_id=c.tenant_id WHERE c.tenant_id IS NOT NULL AND t.tenant_id IS NULL)::bigint AS count
UNION ALL
SELECT 'package_lines.rows' AS check_name, (SELECT count(*) FROM package_lines)::bigint AS count
UNION ALL
SELECT 'package_lines.tenant_missing' AS check_name, (SELECT count(*) FROM package_lines WHERE tenant_id IS NULL)::bigint AS count
UNION ALL
SELECT 'package_lines.tenant_unknown' AS check_name, (SELECT count(*) FROM package_lines c LEFT JOIN tenants t ON t.tenant_id=c.tenant_id WHERE c.tenant_id IS NOT NULL AND t.tenant_id IS NULL)::bigint AS count
UNION ALL
SELECT 'company_logos.rows' AS check_name, (SELECT count(*) FROM company_logos)::bigint AS count
UNION ALL
SELECT 'company_logos.tenant_missing' AS check_name, (SELECT count(*) FROM company_logos WHERE tenant_id IS NULL)::bigint AS count
UNION ALL
SELECT 'company_logos.tenant_unknown' AS check_name, (SELECT count(*) FROM company_logos c LEFT JOIN tenants t ON t.tenant_id=c.tenant_id WHERE c.tenant_id IS NOT NULL AND t.tenant_id IS NULL)::bigint AS count
UNION ALL
SELECT 'import_files.rows' AS check_name, (SELECT count(*) FROM import_files)::bigint AS count
UNION ALL
SELECT 'import_files.tenant_missing' AS check_name, (SELECT count(*) FROM import_files WHERE tenant_id IS NULL)::bigint AS count
UNION ALL
SELECT 'import_files.tenant_unknown' AS check_name, (SELECT count(*) FROM import_files c LEFT JOIN tenants t ON t.tenant_id=c.tenant_id WHERE c.tenant_id IS NOT NULL AND t.tenant_id IS NULL)::bigint AS count
UNION ALL
SELECT 'tenant_margin_policies.rows' AS check_name, (SELECT count(*) FROM tenant_margin_policies)::bigint AS count
UNION ALL
SELECT 'tenant_margin_policies.tenant_missing' AS check_name, (SELECT count(*) FROM tenant_margin_policies WHERE tenant_id IS NULL)::bigint AS count
UNION ALL
SELECT 'tenant_margin_policies.tenant_unknown' AS check_name, (SELECT count(*) FROM tenant_margin_policies c LEFT JOIN tenants t ON t.tenant_id=c.tenant_id WHERE c.tenant_id IS NOT NULL AND t.tenant_id IS NULL)::bigint AS count
UNION ALL
SELECT 'tenant_capabilities.rows' AS check_name, (SELECT count(*) FROM tenant_capabilities)::bigint AS count
UNION ALL
SELECT 'tenant_capabilities.tenant_missing' AS check_name, (SELECT count(*) FROM tenant_capabilities WHERE tenant_id IS NULL)::bigint AS count
UNION ALL
SELECT 'tenant_capabilities.tenant_unknown' AS check_name, (SELECT count(*) FROM tenant_capabilities c LEFT JOIN tenants t ON t.tenant_id=c.tenant_id WHERE c.tenant_id IS NOT NULL AND t.tenant_id IS NULL)::bigint AS count
UNION ALL
SELECT 'tenant_capability_events.rows' AS check_name, (SELECT count(*) FROM tenant_capability_events)::bigint AS count
UNION ALL
SELECT 'tenant_capability_events.tenant_missing' AS check_name, (SELECT count(*) FROM tenant_capability_events WHERE tenant_id IS NULL)::bigint AS count
UNION ALL
SELECT 'tenant_capability_events.tenant_unknown' AS check_name, (SELECT count(*) FROM tenant_capability_events c LEFT JOIN tenants t ON t.tenant_id=c.tenant_id WHERE c.tenant_id IS NOT NULL AND t.tenant_id IS NULL)::bigint AS count
UNION ALL
SELECT 'opportunities.client_id_invalid' AS check_name, (SELECT count(*) FROM opportunities c LEFT JOIN clients p ON p.client_id=c.client_id WHERE c.client_id IS NOT NULL AND (p.client_id IS NULL OR c.tenant_id IS DISTINCT FROM p.tenant_id))::bigint AS count
UNION ALL
SELECT 'client_contacts.client_id_invalid' AS check_name, (SELECT count(*) FROM client_contacts c LEFT JOIN clients p ON p.client_id=c.client_id WHERE c.client_id IS NOT NULL AND (p.client_id IS NULL OR c.tenant_id IS DISTINCT FROM p.tenant_id))::bigint AS count
UNION ALL
SELECT 'tasks.client_id_invalid' AS check_name, (SELECT count(*) FROM tasks c LEFT JOIN clients p ON p.client_id=c.client_id WHERE c.client_id IS NOT NULL AND (p.client_id IS NULL OR c.tenant_id IS DISTINCT FROM p.tenant_id))::bigint AS count
UNION ALL
SELECT 'interaction_logs.client_id_invalid' AS check_name, (SELECT count(*) FROM interaction_logs c LEFT JOIN clients p ON p.client_id=c.client_id WHERE c.client_id IS NOT NULL AND (p.client_id IS NULL OR c.tenant_id IS DISTINCT FROM p.tenant_id))::bigint AS count
UNION ALL
SELECT 'quotes.client_id_invalid' AS check_name, (SELECT count(*) FROM quotes c LEFT JOIN clients p ON p.client_id=c.client_id WHERE c.client_id IS NOT NULL AND (p.client_id IS NULL OR c.tenant_id IS DISTINCT FROM p.tenant_id))::bigint AS count
UNION ALL
SELECT 'quotes.opportunity_id_invalid' AS check_name, (SELECT count(*) FROM quotes c LEFT JOIN opportunities p ON p.opportunity_id=c.opportunity_id WHERE c.opportunity_id IS NOT NULL AND (p.opportunity_id IS NULL OR c.tenant_id IS DISTINCT FROM p.tenant_id))::bigint AS count
UNION ALL
SELECT 'proposals.opportunity_id_invalid' AS check_name, (SELECT count(*) FROM proposals c LEFT JOIN opportunities p ON p.opportunity_id=c.opportunity_id WHERE c.opportunity_id IS NOT NULL AND (p.opportunity_id IS NULL OR c.tenant_id IS DISTINCT FROM p.tenant_id))::bigint AS count
UNION ALL
SELECT 'proposal_items.proposal_id_invalid' AS check_name, (SELECT count(*) FROM proposal_items c LEFT JOIN proposals p ON p.proposal_id=c.proposal_id WHERE c.proposal_id IS NOT NULL AND (p.proposal_id IS NULL OR c.tenant_id IS DISTINCT FROM p.tenant_id))::bigint AS count
UNION ALL
SELECT 'formal_proposals.proposal_id_invalid' AS check_name, (SELECT count(*) FROM formal_proposals c LEFT JOIN proposals p ON p.proposal_id=c.proposal_id WHERE c.proposal_id IS NOT NULL AND (p.proposal_id IS NULL OR c.tenant_id IS DISTINCT FROM p.tenant_id))::bigint AS count
UNION ALL
SELECT 'formal_proposals.quote_id_invalid' AS check_name, (SELECT count(*) FROM formal_proposals c LEFT JOIN quotes p ON p.quote_id=c.quote_id WHERE c.quote_id IS NOT NULL AND (p.quote_id IS NULL OR c.tenant_id IS DISTINCT FROM p.tenant_id))::bigint AS count
UNION ALL
SELECT 'proposal_audit_events.proposal_id_invalid' AS check_name, (SELECT count(*) FROM proposal_audit_events c LEFT JOIN proposals p ON p.proposal_id=c.proposal_id WHERE c.proposal_id IS NOT NULL AND (p.proposal_id IS NULL OR c.tenant_id IS DISTINCT FROM p.tenant_id))::bigint AS count
UNION ALL
SELECT 'proposal_approvals.proposal_id_invalid' AS check_name, (SELECT count(*) FROM proposal_approvals c LEFT JOIN proposals p ON p.proposal_id=c.proposal_id WHERE c.proposal_id IS NOT NULL AND (p.proposal_id IS NULL OR c.tenant_id IS DISTINCT FROM p.tenant_id))::bigint AS count
UNION ALL
SELECT 'proposal_integrated_node.proposal_id_invalid' AS check_name, (SELECT count(*) FROM proposal_integrated_node c LEFT JOIN proposals p ON p.proposal_id=c.proposal_id WHERE c.proposal_id IS NOT NULL AND (p.proposal_id IS NULL OR c.tenant_id IS DISTINCT FROM p.tenant_id))::bigint AS count
UNION ALL
SELECT 'proposal_profitability_node.proposal_id_invalid' AS check_name, (SELECT count(*) FROM proposal_profitability_node c LEFT JOIN proposals p ON p.proposal_id=c.proposal_id WHERE c.proposal_id IS NOT NULL AND (p.proposal_id IS NULL OR c.tenant_id IS DISTINCT FROM p.tenant_id))::bigint AS count
UNION ALL
SELECT 'project_expenses.proposal_id_invalid' AS check_name, (SELECT count(*) FROM project_expenses c LEFT JOIN proposals p ON p.proposal_id=c.proposal_id WHERE c.proposal_id IS NOT NULL AND (p.proposal_id IS NULL OR c.tenant_id IS DISTINCT FROM p.tenant_id))::bigint AS count
UNION ALL
SELECT 'proposal_derivations.base_proposal_id_invalid' AS check_name, (SELECT count(*) FROM proposal_derivations c LEFT JOIN proposals p ON p.proposal_id=c.base_proposal_id WHERE c.base_proposal_id IS NOT NULL AND (p.proposal_id IS NULL OR c.tenant_id IS DISTINCT FROM p.tenant_id))::bigint AS count
UNION ALL
SELECT 'proposal_derivations.derived_proposal_id_invalid' AS check_name, (SELECT count(*) FROM proposal_derivations c LEFT JOIN proposals p ON p.proposal_id=c.derived_proposal_id WHERE c.derived_proposal_id IS NOT NULL AND (p.proposal_id IS NULL OR c.tenant_id IS DISTINCT FROM p.tenant_id))::bigint AS count
UNION ALL
SELECT 'package_lines.package_id_invalid' AS check_name, (SELECT count(*) FROM package_lines c LEFT JOIN packages p ON p.package_id=c.package_id WHERE c.package_id IS NOT NULL AND (p.package_id IS NULL OR c.tenant_id IS DISTINCT FROM p.tenant_id))::bigint AS count
UNION ALL
SELECT 'import_files.quote_id_invalid' AS check_name, (SELECT count(*) FROM import_files c LEFT JOIN quotes p ON p.quote_id=c.quote_id WHERE c.quote_id IS NOT NULL AND (p.quote_id IS NULL OR c.tenant_id IS DISTINCT FROM p.tenant_id))::bigint AS count
UNION ALL
SELECT 'tasks.opportunity_invalid' AS check_name, (SELECT count(*) FROM tasks c LEFT JOIN opportunities p ON p.opportunity_id=c.opportunity_id WHERE c.opportunity_id IS NOT NULL AND (p.opportunity_id IS NULL OR c.tenant_id IS DISTINCT FROM p.tenant_id OR c.client_id IS DISTINCT FROM p.client_id))::bigint AS count
UNION ALL
SELECT 'interaction_logs.opportunity_invalid' AS check_name, (SELECT count(*) FROM interaction_logs c LEFT JOIN opportunities p ON p.opportunity_id=c.opportunity_id WHERE c.opportunity_id IS NOT NULL AND (p.opportunity_id IS NULL OR c.tenant_id IS DISTINCT FROM p.tenant_id OR c.client_id IS DISTINCT FROM p.client_id))::bigint AS count
UNION ALL
SELECT 'quotes.opportunity_client_mismatch' AS check_name, (SELECT count(*) FROM quotes q JOIN opportunities o ON o.opportunity_id=q.opportunity_id WHERE q.client_id IS NOT NULL AND q.client_id IS DISTINCT FROM o.client_id)::bigint AS count
UNION ALL
SELECT 'quotes.parent_invalid' AS check_name, (SELECT count(*) FROM quotes q LEFT JOIN quotes p ON p.quote_id=q.parent_quote_id WHERE q.parent_quote_id IS NOT NULL AND (p.quote_id IS NULL OR q.tenant_id IS DISTINCT FROM p.tenant_id))::bigint AS count
UNION ALL
SELECT 'quotes.group_shared_across_tenants' AS check_name, (SELECT count(*) FROM (SELECT quote_group_id FROM quotes WHERE quote_group_id IS NOT NULL GROUP BY quote_group_id HAVING count(DISTINCT tenant_id)>1) g)::bigint AS count
UNION ALL
SELECT 'proposals.origin_quote_cross_tenant' AS check_name, (SELECT count(*) FROM proposals p JOIN quotes q ON q.quote_id=p.origin WHERE p.tenant_id IS DISTINCT FROM q.tenant_id)::bigint AS count
UNION ALL
SELECT 'quotes.author_unknown' AS check_name, (SELECT count(*) FROM quotes c LEFT JOIN app_users u ON u.user_id=c.created_by_user_id WHERE c.created_by_user_id IS NOT NULL AND u.user_id IS NULL)::bigint AS count
UNION ALL
SELECT 'quotes.author_foreign_non_superadmin' AS check_name, (SELECT count(*) FROM quotes c JOIN app_users u ON u.user_id=c.created_by_user_id WHERE u.tenant_id IS DISTINCT FROM c.tenant_id AND lower(trim(u.role)) NOT IN ('superadmin','super_admin','platform_admin','root'))::bigint AS count
UNION ALL
SELECT 'quotes.author_unassigned' AS check_name, (SELECT count(*) FROM quotes WHERE created_by_user_id IS NULL)::bigint AS count
UNION ALL
SELECT 'proposals.author_unknown' AS check_name, (SELECT count(*) FROM proposals c LEFT JOIN app_users u ON u.user_id=c.created_by_user_id WHERE c.created_by_user_id IS NOT NULL AND u.user_id IS NULL)::bigint AS count
UNION ALL
SELECT 'proposals.author_foreign_non_superadmin' AS check_name, (SELECT count(*) FROM proposals c JOIN app_users u ON u.user_id=c.created_by_user_id WHERE u.tenant_id IS DISTINCT FROM c.tenant_id AND lower(trim(u.role)) NOT IN ('superadmin','super_admin','platform_admin','root'))::bigint AS count
UNION ALL
SELECT 'proposals.author_unassigned' AS check_name, (SELECT count(*) FROM proposals WHERE created_by_user_id IS NULL)::bigint AS count
UNION ALL
SELECT 'opportunities.author_unknown' AS check_name, (SELECT count(*) FROM opportunities c LEFT JOIN app_users u ON u.user_id=c.owner_user_id WHERE c.owner_user_id IS NOT NULL AND u.user_id IS NULL)::bigint AS count
UNION ALL
SELECT 'opportunities.author_foreign_non_superadmin' AS check_name, (SELECT count(*) FROM opportunities c JOIN app_users u ON u.user_id=c.owner_user_id WHERE u.tenant_id IS DISTINCT FROM c.tenant_id AND lower(trim(u.role)) NOT IN ('superadmin','super_admin','platform_admin','root'))::bigint AS count
UNION ALL
SELECT 'opportunities.author_unassigned' AS check_name, (SELECT count(*) FROM opportunities WHERE owner_user_id IS NULL)::bigint AS count
UNION ALL
SELECT 'tasks.author_unknown' AS check_name, (SELECT count(*) FROM tasks c LEFT JOIN app_users u ON u.user_id=c.created_by_user_id WHERE c.created_by_user_id IS NOT NULL AND u.user_id IS NULL)::bigint AS count
UNION ALL
SELECT 'tasks.author_foreign_non_superadmin' AS check_name, (SELECT count(*) FROM tasks c JOIN app_users u ON u.user_id=c.created_by_user_id WHERE u.tenant_id IS DISTINCT FROM c.tenant_id AND lower(trim(u.role)) NOT IN ('superadmin','super_admin','platform_admin','root'))::bigint AS count
UNION ALL
SELECT 'tasks.author_unassigned' AS check_name, (SELECT count(*) FROM tasks WHERE created_by_user_id IS NULL)::bigint AS count
UNION ALL
SELECT 'interaction_logs.author_unknown' AS check_name, (SELECT count(*) FROM interaction_logs c LEFT JOIN app_users u ON u.user_id=c.created_by_user_id WHERE c.created_by_user_id IS NOT NULL AND u.user_id IS NULL)::bigint AS count
UNION ALL
SELECT 'interaction_logs.author_foreign_non_superadmin' AS check_name, (SELECT count(*) FROM interaction_logs c JOIN app_users u ON u.user_id=c.created_by_user_id WHERE u.tenant_id IS DISTINCT FROM c.tenant_id AND lower(trim(u.role)) NOT IN ('superadmin','super_admin','platform_admin','root'))::bigint AS count
UNION ALL
SELECT 'interaction_logs.author_unassigned' AS check_name, (SELECT count(*) FROM interaction_logs WHERE created_by_user_id IS NULL)::bigint AS count
UNION ALL
SELECT 'clients.client_logo_id_foreign' AS check_name, (SELECT count(*) FROM clients c JOIN company_logos l ON l.logo_id=c.client_logo_id WHERE l.tenant_id IS NOT NULL AND l.tenant_id IS DISTINCT FROM c.tenant_id)::bigint AS count
UNION ALL
SELECT 'formal_proposals.issuer_logo_id_foreign' AS check_name, (SELECT count(*) FROM formal_proposals c JOIN company_logos l ON l.logo_id=c.issuer_logo_id WHERE l.tenant_id IS NOT NULL AND l.tenant_id IS DISTINCT FROM c.tenant_id)::bigint AS count
UNION ALL
SELECT 'formal_proposals.client_logo_id_foreign' AS check_name, (SELECT count(*) FROM formal_proposals c JOIN company_logos l ON l.logo_id=c.client_logo_id WHERE l.tenant_id IS NOT NULL AND l.tenant_id IS DISTINCT FROM c.tenant_id)::bigint AS count
UNION ALL
SELECT 'users.active_pending' AS check_name, (SELECT count(*) FROM app_users WHERE active AND user_id LIKE 'pending_%')::bigint AS count
UNION ALL
SELECT 'users.active_legacy_non_clerk' AS check_name, (SELECT count(*) FROM app_users WHERE active AND user_id NOT LIKE 'pending_%' AND user_id NOT LIKE 'user_%')::bigint AS count
UNION ALL
SELECT 'users.active_clerk_shaped' AS check_name, (SELECT count(*) FROM app_users WHERE active AND user_id LIKE 'user_%')::bigint AS count
UNION ALL
SELECT 'proposals.closed_without_date' AS check_name, (SELECT count(*) FROM proposals WHERE outcome IN ('won','lost') AND outcome_at IS NULL)::bigint AS count
UNION ALL
SELECT 'quotes.legacy_no_opportunity' AS check_name, (SELECT count(*) FROM quotes WHERE opportunity_id IS NULL)::bigint AS count
UNION ALL
SELECT 'proposals.legacy_no_opportunity' AS check_name, (SELECT count(*) FROM proposals WHERE opportunity_id IS NULL)::bigint AS count
UNION ALL
SELECT 'schema.crm_fk_validated' AS check_name, (SELECT count(*) FROM pg_constraint WHERE conname IN ('crm_opportunities_tenant_fk','crm_opportunities_client_fk','crm_contacts_client_fk','crm_tasks_client_fk','crm_tasks_opportunity_fk','crm_interactions_client_fk','crm_interactions_opportunity_fk','crm_quotes_client_fk','crm_quotes_opportunity_fk','crm_proposals_opportunity_fk','document_items_proposal_tenant_fk','document_formal_proposal_tenant_fk','document_audit_proposal_tenant_fk') AND convalidated)::bigint AS count
) checks ORDER BY check_name;
