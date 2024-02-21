import {
  info,
  warning,
} from '@actions/core';

import { HandleTransitionParams } from './interfaces';
import { JiraClient } from './jira';

const transitionIssue = async ({
  jiraToken,
  jiraEndpoint,
  jiraIssueId,
  colName
}: HandleTransitionParams) => {
  console.log(`Transition issue ${jiraIssueId} to status ${colName}`)
  const jira = new JiraClient(jiraToken);

  const issueDetail = await jira.request(
    `${jiraEndpoint}/rest/api/2/issue/${jiraIssueId}`
  );
  const {
    fields: {
      status: { name }
    }
  } = issueDetail;
  console.log(`Current issue status is ${name}`)
  if (name === colName) {
    warning(`
        The issue ${jiraIssueId} is already in status ${colName}.
        Action will exit without doing anything.  
      `);
  } else {
    const availableTransitions = await jira.request(
      `${jiraEndpoint}/rest/api/2/issue/${jiraIssueId}/transitions`
    );
    const transitionId = availableTransitions.transitions?.find(
      (t: any) => t.to.name === colName
    )?.id;
    console.log(`Transition id is ${transitionId}`)
    if (!transitionId)
      throw new Error(`
      There was an error trying to transition issue ${jiraIssueId}:
      Transition to status "${colName}" cannot be found.
      Check all of the transitions' rules, conditions of yourr project's workflow.
      See more: https://confluence.atlassian.com/adminjiraserver073/working-with-workflows-861253510.html
    `);
    info(`Changing issue ${jiraIssueId} to ${colName}`);
    console.log(`Changing issue ${jiraIssueId} to ${colName}`)
    let result = await jira.request(
      `${jiraEndpoint}/rest/api/2/issue/${jiraIssueId}/transitions`,
      "POST",
      { transition: { id: transitionId } }
    );
    console.log(`Issue ${jiraIssueId} successfully transitioned to ${colName}`)
    console.log(`Response: ${JSON.stringify(result, null, 4)}`)
  }
};

const handleTransitionIssue = async ({
  resolveTicketIdsFunc,
  branchName,
  ...rest
}: HandleTransitionParams) => {
  console.log(`Transitioning issue: branch name = ${branchName}, issueId = ${rest.jiraIssueId}`)
  if (resolveTicketIdsFunc && branchName) {
    const result = await resolveTicketIdsFunc(branchName);
    if (Array.isArray(result)) {
      result.forEach(ticketId => {
        transitionIssue({ ...rest, jiraIssueId: ticketId });
      });
    } else if (typeof result === "string") {
      transitionIssue({ ...rest, jiraIssueId: result });
    } else {
      transitionIssue({ ...rest });
    }
  } else {
    transitionIssue({ ...rest });
  }
};

export { handleTransitionIssue };
