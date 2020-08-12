import * as cdk from '@aws-cdk/core';
import * as sns from '@aws-cdk/aws-sns';
import * as iam from '@aws-cdk/aws-iam';
import * as ssm from '@aws-cdk/aws-ssm';
import * as codebuild from '@aws-cdk/aws-codebuild';
import * as codepipeline from '@aws-cdk/aws-codepipeline';
import * as cpaction from '@aws-cdk/aws-codepipeline-actions';

export class PipelineStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, environment: any, props?: cdk.StackProps) {
    super(scope, id, props);

    const goldenImage = codebuild.LinuxBuildImage.fromDockerRegistry(
      'sygna/codebuild_base_image:latest',
    );

    const buildRole = new iam.Role(this, `CodeBuild-Role-${environment.ENV}`, {
      roleName: `codebuild-role-${environment.ENV.toLowerCase()}`,
      assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com'),
      managedPolicies: [
        { managedPolicyArn: 'arn:aws:iam::aws:policy/AWSCodeBuildAdminAccess' },
        { managedPolicyArn: 'arn:aws:iam::aws:policy/AmazonSSMReadOnlyAccess' },
        { managedPolicyArn: 'arn:aws:iam::aws:policy/AmazonS3FullAccess' },
        { managedPolicyArn: 'arn:aws:iam::aws:policy/AWSLambdaFullAccess' },
        { managedPolicyArn: 'arn:aws:iam::aws:policy/AmazonAPIGatewayAdministrator' },
      ],
    });

    new iam.Policy(this, `Codebuild-Policy-${environment.ENV}`, {
      policyName: `CodebuildActions`,
      roles: [buildRole],
      statements: [
        new iam.PolicyStatement({
          resources: ['*'],
          actions: [
            'cloudformation:*',
            'ec2:*',
            'sts:*',
            'ecr:*',
            'ecs:*',
            'ssm:*',
            'secretsmanager:GetSecretValue',
            'iam:*',
            'kms:*',
            'log:*',
          ],
        }),
      ],
    });

    const codePipeline = new codepipeline.Pipeline(this, `Pipeline-${environment.ENV}  `, {
      pipelineName: `pipeline-${environment.ENV}`,
      restartExecutionOnUpdate: true,
    });

    // Source stage, grab code from Github
    const sourceStage = codePipeline.addStage({
      stageName: 'Source',
    });

    // Approve stage
    const approveStage = codePipeline.addStage({
      stageName: 'Approval',
    });

    // Deploy stage
    const deployStage = codePipeline.addStage({
      stageName: 'Deploy',
      placement: {
        justAfter: approveStage,
      },
    });

    const oauthSecret = cdk.SecretValue.secretsManager('bridge-githubAccessToken');

    const sourceOutput = new codepipeline.Artifact('sourceOutput');
    const sourceAction = new cpaction.GitHubSourceAction({
      actionName: `codebuild-action-${environment.ENV}`,
      owner: environment.owner,
      repo: environment.repo,
      oauthToken: oauthSecret,
      branch: `${environment.branch}`,
      trigger: cpaction.GitHubTrigger.WEBHOOK,
      output: sourceOutput,
    });

    sourceStage.addAction(sourceAction);

    const snsArn = ssm.StringParameter.fromStringParameterName(
      this,
      `cdk-arn-slackSNS`,
      '/CDK/arn/slack-sns',
    ).stringValue;

    // Approve stage
    const ApprovalSNS = sns.Topic.fromTopicArn(this, `ApprovalSNS-${environment.ENV}`, snsArn);
    const approvalAction = new cpaction.ManualApprovalAction({
      actionName: 'ApprovalOrDeny',
      notificationTopic: ApprovalSNS,
      externalEntityLink: `https://github.com/${environment.owner}/${sourceAction.variables.repositoryName}/commit/${sourceAction.variables.commitId}`,
      additionalInformation: 'Please check Github commit before APPROVE!!',
    });

    approveStage?.addAction(approvalAction);

    const codeBuildDeploy = new codebuild.PipelineProject(
      this,
      `Codebuild-Deploy-${environment.ENV}`,
      {
        projectName: `Codebuild-Deploy-${environment.ENV}`,
        description: `Codebuild Deploy - ${environment.ENV}`,
        role: buildRole,
        environment: {
          buildImage: goldenImage,
          privileged: true,
        },
        buildSpec: codebuild.BuildSpec.fromSourceFilename('buildspecDeploy.yml'),
        environmentVariables: {
          ENV: {
            value: environment.ENV,
          },
          BRANCH: {
            value: environment.branch,
          },
        },
      },
    );
    // Deploy stage
    const deployAction = new cpaction.CodeBuildAction({
      actionName: 'Deploy',
      input: sourceOutput,
      project: codeBuildDeploy,
    });
    deployStage.addAction(deployAction);
  }
}
