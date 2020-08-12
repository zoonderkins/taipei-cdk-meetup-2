import * as cdk from '@aws-cdk/core';
import * as log from '@aws-cdk/aws-logs';
import * as lambda from '@aws-cdk/aws-lambda';
import * as apigateway from '@aws-cdk/aws-apigateway';
import * as sns from '@aws-cdk/aws-sns';
import * as subs from '@aws-cdk/aws-sns-subscriptions';
import * as iam from '@aws-cdk/aws-iam';
import * as ssm from '@aws-cdk/aws-ssm';

import { CodebuildOptions } from './types';

export class CDKMeetupApprovalStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string,environment: CodebuildOptions, props?: cdk.StackProps) {
    super(scope, id, props);

    // Lambda grant Codepipeline action
    const lambdaRoleStatements: iam.PolicyStatement[] = [
      new iam.PolicyStatement({
        actions: [
        'codepipeline:*',
        'secretsmanager:GetSecretValue',
        'ssm:GetParameter',
        'iam:ListUsers',
        'iam:GetGroup',
        'lambda:InvokeFunction',
      ],
        resources: [
          `arn:aws:ssm:${this.region}:${this.account}:parameter/*`,
          `arn:aws:codepipeline:${this.region}:${this.account}:*`,
          `arn:aws:secretsmanager:${this.region}:${this.account}:secret:*`,
          `arn:aws:iam::${this.account}:user/*`,
          `arn:aws:iam::${this.account}:group/Approver`,
        ]
      })
    ]

    // Lambda exectuion role
    const lambdaExeRole = new iam.Role(this, `CDK-ApprovalExeRole-${environment.ENV}`, {
      roleName: `CDKApprovalLambdaExeRole-${environment.ENV}`,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        {
          managedPolicyArn:
            'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole',
        },
      ],
      inlinePolicies: {
        InlinePolicy: new iam.PolicyDocument({
          statements: lambdaRoleStatements,
        }),
      },
    });

    const sendApprovalToSlackFunc = new lambda.Function(this, `CDK-SendApprovalToSlack-Func-${environment.ENV}`, {
      logRetention: log.RetentionDays.ONE_MONTH,
      role: lambdaExeRole,
      functionName: `CDK-sendApprovalToSlack-${environment.ENV}`,
      runtime: lambda.Runtime.PYTHON_3_8,
      code: lambda.AssetCode.fromAsset('source'),
      handler: 'sendApprovalToSlack.handler',
      environment: {
        ENV: environment.ENV
      }
    });

    // Enable a SNS for Lambda
    const CDKApprovalSNS = new sns.Topic(this, `CDK-Approval-SNS-${environment.ENV}`, {
       displayName: `CDK-Approval-SNS-${environment.ENV}`
    })

    CDKApprovalSNS.addSubscription(new subs.LambdaSubscription(sendApprovalToSlackFunc))

    const approvalTriggerFunc = new lambda.Function(this, `CDK-ApprovalTrigger-Func-${environment.ENV}`, {
      logRetention: log.RetentionDays.ONE_MONTH,
      role: lambdaExeRole,
      functionName: `CDK-approvalTrigger-func-${environment.ENV}`,
      runtime: lambda.Runtime.PYTHON_3_8,
      code: lambda.AssetCode.fromAsset('source'),
      handler: 'InteractiveMessageHandler.handler',
      environment: {
        ENV: environment.ENV
      }
    });

    const api = new apigateway.RestApi(this, `CDK-ApprovalTrigger-Slackbot-${environment.ENV}`, {
      restApiName: `CDK-ApprovalTrigger-${environment.ENV}`,
      description: "A gateway trigger Codepipeline approval action through slack bot."
    });

    const approvalTriggerFuncLambda = new apigateway.LambdaIntegration(approvalTriggerFunc, {
      proxy: true,
    })
    const rootPath = api.root.resourceForPath('/bot')

    rootPath.addMethod('POST', approvalTriggerFuncLambda);

    // Just output Cfn

    new ssm.StringParameter(this, 'CDK-Slack-Channel', {
      allowedPattern: '.*',
      description: 'Slack Channel ID',
      parameterName: '/CDK/arn/slack-channel',
      stringValue: environment.slackID,
      tier: ssm.ParameterTier.STANDARD,
    });

    new ssm.StringParameter(this, 'CDK-Slack-trigger-func-Arn', {
      allowedPattern: '.*',
      description: 'Slack approval trigger func arn ',
      parameterName: '/CDK/arn/slack-approval-func',
      stringValue: approvalTriggerFunc.functionArn,
      tier: ssm.ParameterTier.STANDARD,
    });
    new ssm.StringParameter(this, 'CDK-Slack-SNS-Arn', {
      allowedPattern: '.*',
      description: 'Slack approval SNS arn ',
      parameterName: '/CDK/arn/slack-sns',
      stringValue: CDKApprovalSNS.topicArn,
      tier: ssm.ParameterTier.STANDARD,
    });

    new cdk.CfnOutput(this, `export-approval-trigger-func-arn-${environment.ENV}`, {
      value: approvalTriggerFunc.functionArn,
    });
    new cdk.CfnOutput(this, `export-approvalSNS-arn-${environment.ENV}`, {
      value: CDKApprovalSNS.topicArn,
    });
  }
}
