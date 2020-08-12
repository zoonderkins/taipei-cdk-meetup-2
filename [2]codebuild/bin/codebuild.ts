import { App, Tag } from '@aws-cdk/core';
import { PipelineStack } from '../lib/pipeline-stack';

const app = new App();
const TagENV: string = app.node.tryGetContext('stage');

const customTag = {
  Owner: 'Edward Oo',
  ApplicationVersion: '1.0.0',
  Environment: TagENV,
  Application: 'CodeBuild',
  Description: 'CDK generated Bridge Api Codebuild ',
};

let environment;
if (TagENV == '' || TagENV == undefined || TagENV == null) {
  throw new Error("command -c stage can't be empty, must be Development, Test, Production");
} else if (TagENV.match('Sandbox')) {
  environment = {
    ENV: 'dev',
    branch: 'master',
    owner: 'ookangzheng',
    repo: 'taipei-cdk-meetup-2-app',
  };
} else {
  throw new Error(`CDK error: Incompatible stage ${TagENV}`);
}

const pipe = new PipelineStack(app, `codebuild-${environment.ENV}`, environment, {
  description: `Codebuild - ${environment.ENV} deployed ${customTag.Owner}`,
});

Object.entries(customTag).forEach(([k, v]) => {
  Tag.add(pipe, k, v);
});
