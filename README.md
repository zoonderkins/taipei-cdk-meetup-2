## Taiwan CDK Meetup #2 Sample Codebuild + Slackbot

## Installation

1. Install Slackbot

```javascript
// [1]slackbot/bin/approval_slack_bot.ts
// Replace with your own Slack ID, slackBot Token

slackID: 'G012VD6LPRC'

```

1.1 Put slack token to parameter store
```bash
// Put slack token via cli
aws ssm put-parameter \
    --name "/CDK/arn/slack-token" \
    --type "String" \
    --value "12345678" \
```

1.2 Permission for bot

```
// https://slack.com/intl/en-tw/help/articles/115005265703-Create-a-bot-for-your-workspace
// https://api.slack.com/apps

channels:history
channels:read
chat:write
```

2. Install Codebuild

Replace with your own repository Name, Branch, Owner

```
branch: 'master',
owner: 'ookangzheng',
repo: 'taipei-cdk-meetup-2-app',
```

Also create a Github API Token with permission `https://github.com/settings/tokens`, and paste it on AWS `Secret Manager` with following name: `bridge-githubAccessToken`

**Put github Token into Secret Manager**
```
aws secretsmanager create-secret --name bridge-githubAccessToken \
--description "CDK Meetup demo token" \
    --secret-string xxxx1234546
```

**Webhook permission on github**
```
 repo
    repo:status
    repo_deployment
    public_repo
    repo:invite
    security_events

 admin:repo_hook
    write:repo_hook
    read:repo_hook
```

## Screenshot

![](https://raw.githubusercontent.com/ookangzheng/taipei-cdk-meetup-2/master/slackbot-approval.png)
