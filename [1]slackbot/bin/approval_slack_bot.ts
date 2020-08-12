#!/usr/bin/env node
import 'source-map-support/register';
import { App, Tag } from '@aws-cdk/core';
import { CDKMeetupApprovalStack } from '../lib/approval_slack_bot';
import { CodebuildOptions } from '../lib/types';

const app = new App();

const TagENV: string = app.node.tryGetContext('stage');

const customTag = {
  Owner: 'Edward Oo',
  ApplicationVersion: '1.0.0',
  Environment: TagENV,
  Application: 'Slack bot',
  Description: 'A slack bot which handle approval notification and trigger.',
};
let environment: CodebuildOptions;

if (TagENV == '' || TagENV == undefined || TagENV == null) {
  throw new Error("command -c stage can't be empty, must be Development, Test, Production");
} else if (TagENV.match('Sandbox') || TagENV.match('sandbox')) {
  environment = {
    ENV: 'dev',
    slackID: 'G012VXXX',
  };
} else {
  throw new Error(`CDK error: Incompatible stage ${TagENV}`);
}

const pipe = new CDKMeetupApprovalStack(app, `approval-slackbot-${environment.ENV}`,environment, {
  description: `Approval slack bot - ${environment.ENV} deployed ${customTag.Owner}`,
});

Object.entries(customTag).forEach(([k, v]) => {
  Tag.add(pipe, k, v);
});

