import json
import os
import boto3
import sys
from pprint import pprint
from botocore.exceptions import ClientError
from base64 import b64decode
from urllib.parse import parse_qs
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

def send_slack_message(action_details):
    codepipeline_status = "Approved" if action_details["approve"] else "Rejected"
    codepipeline_name = action_details["codePipelineName"]
    token = action_details["codePipelineToken"]
    # print(action_details)
    client = boto3.client("codepipeline")
    response_approval = client.put_approval_result(
        pipelineName=codepipeline_name,
        stageName="Approval",
        actionName="ApprovalOrDeny",
        result={"summary": "", "status": codepipeline_status},
        token=token,
    )
    print(response_approval)


def handler(event, context):
    # print("Received event: " + json.dumps(event, indent=2))
    body = parse_qs(event["body"])
    payload = json.loads(body["payload"][0])
    currentUser = payload["user"]["name"]

    iam = boto3.client("iam")
    approvalUser = iam.get_group(GroupName="Approver")

    slackApproveState = json.loads(payload["actions"][0]["value"])
    pipeLineName = slackApproveState["codePipelineName"]
    TIMESTAMP = payload["message_ts"]
    a = payload["original_message"]["blocks"][0]
    b = payload["original_message"]["attachments"][0]
    print(f'Total user: {approvalUser["Users"]}')
    for user in approvalUser["Users"]:
        validUser = user["UserName"]
        print(f'user: {user["UserName"]}')

        if slackApproveState["approve"] is True and validUser == currentUser:

            print(
                f"User {currentUser} is valid approver and pressed ALLOW, {validUser}"
            )
            send_slack_message(slackApproveState)
            return {
                "isBase64Encoded": "false",
                "statusCode": 200,
                "body": f"Approved by {currentUser}, App is now ready to deploy \n pipeLine: {pipeLineName} ",
            }

        if slackApproveState["approve"] is False and validUser == currentUser:
            print(
                f"User {currentUser} is valid approver and pressed REJECT, {validUser}"
            )
            send_slack_message(slackApproveState)
            return {
                "isBase64Encoded": "false",
                "statusCode": 200,
                "body": f"Rejected by {currentUser}, App deployment has been stopped. \n pipeLine:{pipeLineName}",
            }

    if validUser != currentUser:

        print(f"User {currentUser} is not approver, {validUser} is")

        resend = {"channel": SLACK_CHANNEL, "blocks": [a], "attachments": [b]}
        req = Request(
            f"{SLACK_API_URL}/chat.postMessage",
            json.dumps(resend).encode("utf-8"),
            headers={
                "content-type": "application/json",
                "Authorization": SLACK_BOT_TOKEN,
            },
        )

        response = urlopen(req)
        response.read()
        # html = response.read()
        # json_obj = json.loads(html)
        # print(json.dumps(json_obj))
        return {
            "isBase64Encoded": "false",
            "statusCode": 200,
            "body": f"User {currentUser} is not allow to perform this operation",
        }
