import os
import json
import logging
import urllib.parse
import pprint
import boto3
from base64 import b64decode
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError


ENV = os.environ['ENV']
SLACK_API_URL = "https://slack.com/api"
ssm = boto3.client('ssm')

def get_ssm_secret(parameter_name):
    return ssm.get_parameter(
        Name= parameter_name,
        WithDecryption=False
    )

slack_channel = get_ssm_secret("/CDK/arn/slack-channel")
slack_bot_token = get_ssm_secret("/CDK/arn/slack-token")

SLACK_BOT_TOKEN = str(slack_bot_token["Parameter"]["Value"])
SLACK_CHANNEL = str(slack_channel["Parameter"]["Value"])

logger = logging.getLogger()
logger.setLevel(logging.INFO)

def handler(event, context):
    message = event["Records"][0]["Sns"]["Message"]

    data = json.loads(message)
    token = data["approval"]["token"]
    codepipeline_name = data["approval"]["pipelineName"]
    approvalConsoleLink = data["approval"]["approvalReviewLink"]
    GithubConsoleLink = data['approval']['externalEntityLink']

    print(data['approval'])
    slack_message = {
        "channel": SLACK_CHANNEL,
        "text": "An approval is waiting for approve.",
        "blocks": [
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": f"An approval is waiting for approve.📍 \n Pipeline: <{approvalConsoleLink}  | {codepipeline_name}⚡️ > \n Status: Waiting for approval \n Github review: {GithubConsoleLink} \n"
                    }
                }
        ],
        "attachments": [
            {
                "text": "Yes to deploy",
                "fallback": "You are unable to deploy",
                "callback_id": "cb",
                "color": "#3AA3E3",
                "attachment_type": "default",
                "actions": [
                    {
                        "name": "deployment",
                        "text": "Yes 🙆‍♂️",
                        "style": "danger",
                        "type": "button",
                        "value": json.dumps({"approve": True, "codePipelineToken": token, "codePipelineName": codepipeline_name}),
                        "confirm": {
                            "title": "Are you sure?",
                            "text": "This action will deploy your app and can't be undo!!",
                            "ok_text": "Yes",
                            "dismiss_text": "No"
                        }
                    },
                    {
                        "name": "deployment",
                        "text": "No 🙅‍♂️",
                        "type": "button",
                        "value": json.dumps({"approve": False, "codePipelineToken": token, "codePipelineName": codepipeline_name})
                    }
                ]
            }
        ]
    }
    print(json.dumps(slack_message))

    req = Request(f'{SLACK_API_URL}/chat.postMessage', json.dumps(slack_message).encode('utf-8'), headers={
        'content-type': 'application/json', "Authorization": SLACK_BOT_TOKEN})

    response = urlopen(req)
    response.read()

    return None
