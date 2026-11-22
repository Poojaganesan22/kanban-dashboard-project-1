pipeline {
  agent any

  options {
    timestamps()
    disableConcurrentBuilds()
    skipDefaultCheckout(true)
  }

  parameters {
    string(name: 'IMAGE_NAME', defaultValue: '', description: 'Full image name, for example ghcr.io/acme/my-app')
    string(name: 'EC2_INSTANCE_ID', defaultValue: '', description: 'SSM managed EC2 instance ID, for example i-0123456789abcdef0')
    string(name: 'AWS_REGION', defaultValue: '', description: 'AWS region containing the EC2 instance')
    string(name: 'APP_PORT', defaultValue: '8080', description: 'Host and container port')
    string(name: 'HEALTH_PATH', defaultValue: '/', description: 'HTTP path checked on EC2')
    string(name: 'CONTAINER_NAME', defaultValue: 'app', description: 'Production Docker container name')
  }

  stages {
    stage('Checkout source') {
      steps {
        checkout scm
        script {
          env.GIT_SHA = sh(script: 'git rev-parse --short=12 HEAD', returnStdout: true).trim()
          env.IMAGE_TAG = "build-${env.BUILD_NUMBER}-${env.GIT_SHA}"
          env.FULL_IMAGE = "${params.IMAGE_NAME}:${env.IMAGE_TAG}"
          env.DEPLOY_ATTEMPTED = 'false'
          if (!(params.IMAGE_NAME ==~ /^[a-zA-Z0-9._:-]+\/[a-zA-Z0-9._\/-]+$/)) {
            error('IMAGE_NAME must include a registry and repository, such as ghcr.io/acme/my-app')
          }
          if (!(params.EC2_INSTANCE_ID ==~ /^i-[a-fA-F0-9]+$/)) {
            error('EC2_INSTANCE_ID must be a valid EC2 instance ID')
          }
          if (!(params.AWS_REGION ==~ /^[a-z0-9-]+$/)) {
            error('AWS_REGION must be a valid AWS region')
          }
          if (!(params.APP_PORT ==~ /^[0-9]{1,5}$/) || params.APP_PORT.toInteger() < 1 || params.APP_PORT.toInteger() > 65535) {
            error('APP_PORT must be between 1 and 65535')
          }
          if (!(params.HEALTH_PATH ==~ /^\/[a-zA-Z0-9_\/?.=&%-]*$/)) {
            error('HEALTH_PATH must be an HTTP path using letters, digits, /, _, -, ?, ., =, or &')
          }
          if (!(params.CONTAINER_NAME ==~ /^[a-zA-Z0-9_.-]+$/)) {
            error('CONTAINER_NAME contains unsupported characters')
          }
        }
      }
    }

    stage('Docker build and tag') {
      steps {
        sh '''
          set -eu
          docker build --label "org.opencontainers.image.revision=$GIT_COMMIT" \
            --tag "$IMAGE_NAME:$IMAGE_TAG" --tag "$IMAGE_NAME:$BUILD_NUMBER" .
        '''
      }
    }

    stage('Registry login and push') {
      steps {
        withCredentials([usernamePassword(credentialsId: 'registry-credentials', usernameVariable: 'REGISTRY_USER', passwordVariable: 'REGISTRY_TOKEN')]) {
          sh '''
            set -eu
            printf '%s' "$REGISTRY_TOKEN" | docker login --username "$REGISTRY_USER" --password-stdin
            docker push "$IMAGE_NAME:$IMAGE_TAG"
            docker push "$IMAGE_NAME:$BUILD_NUMBER"
          '''
        }
      }
    }

    stage('Deploy to EC2') {
      steps {
        script {
          env.DEPLOY_ATTEMPTED = 'true'
          writeFile file: 'deploy-remote.sh', text: '''#!/bin/sh
set -eu
mode=$1
image=$2
container=$3
port=$4
health_path=$5
build_number=$6
candidate="${container}-candidate"
state_file="/tmp/jenkins-deploy-${build_number}.had-previous"
backup="${container}-previous-${build_number}"

case "$mode" in
  deploy)
    docker pull "$image"
    docker rm -f "$candidate" >/dev/null 2>&1 || true
    if docker inspect "$container" >/dev/null 2>&1; then
      echo yes > "$state_file"
      docker stop "$container"
    else
      echo no > "$state_file"
    fi
    if ! docker run -d --name "$candidate" --restart unless-stopped \\
      -p "${port}:${port}" "$image"; then
      if [ "$(cat "$state_file")" = yes ]; then docker start "$container"; fi
      exit 1
    fi
    ;;
  check)
    attempt=0
    until curl --fail --silent "http://127.0.0.1:${port}${health_path}" >/dev/null; do
      attempt=$((attempt + 1))
      if [ "$attempt" -ge 30 ]; then
        echo "Health check failed after 60 seconds."
        docker logs --tail 100 "$candidate" || true
        exit 1
      fi
      sleep 2
    done
    ;;
  promote)
    if [ "$(cat "$state_file")" = yes ]; then docker rename "$container" "$backup"; fi
    if ! docker rename "$candidate" "$container"; then
      if [ "$(cat "$state_file")" = yes ]; then docker rename "$backup" "$container"; fi
      exit 1
    fi
    if [ "$(cat "$state_file")" = yes ]; then docker rm "$backup"; fi
    rm -f "$state_file"
    ;;
  rollback)
    docker rm -f "$candidate" >/dev/null 2>&1 || true
    if docker inspect "$backup" >/dev/null 2>&1; then
      docker rm -f "$container" >/dev/null 2>&1 || true
      docker rename "$backup" "$container"
      docker start "$container"
      echo "Previous container restored."
    elif [ -f "$state_file" ] && [ "$(cat "$state_file")" = yes ]; then
      docker start "$container"
      echo "Previous container restarted."
    else
      echo "No previous container was available to restore."
    fi
    rm -f "$state_file"
    ;;
  *) echo "Unknown operation: $mode" >&2; exit 2 ;;
esac
'''
          runOnEC2('deploy')
        }
      }
    }

    stage('Health check new container') {
      steps {
        script { runOnEC2('check') }
      }
    }

    stage('Mark success') {
      steps {
        script { runOnEC2('promote') }
        echo 'Deployment and health check succeeded; the new container is live.'
      }
    }
  }

  post {
    success {
      echo "SUCCESS: ${env.FULL_IMAGE} is deployed and healthy."
    }
    failure {
      echo 'FAILURE: the run failed. Rolling back the EC2 candidate when deployment had started.'
      script {
        if (env.DEPLOY_ATTEMPTED == 'true') {
          catchError(buildResult: 'FAILURE', stageResult: 'FAILURE') {
            runOnEC2('rollback')
          }
        }
      }
    }
    always {
      sh 'docker logout "${IMAGE_NAME%%/*}" >/dev/null 2>&1 || true'
    }
  }
}

def runOnEC2(String operation) {
  withCredentials([usernamePassword(credentialsId: 'aws-credentials', usernameVariable: 'AWS_ACCESS_KEY_ID', passwordVariable: 'AWS_SECRET_ACCESS_KEY')]) {
    sh """
      set -eu
      set +x
      script_b64=\$(base64 < deploy-remote.sh | tr -d '\\n')
      remote_command=\"printf '%s' '\$script_b64' | base64 -d | sh -s -- '${operation}' '${env.FULL_IMAGE}' '${params.CONTAINER_NAME}' '${params.APP_PORT}' '${params.HEALTH_PATH}' '${env.BUILD_NUMBER}'\"
      parameters=\$(jq -cn --arg command \"\$remote_command\" '{commands: [\$command]}')
      command_id=\$(aws ssm send-command --region '${params.AWS_REGION}' \\
        --instance-ids '${params.EC2_INSTANCE_ID}' --document-name AWS-RunShellScript \\
        --parameters \"\$parameters\" --query 'Command.CommandId' --output text)

      attempt=0
      while [ \"\$attempt\" -lt 60 ]; do
        status=\$(aws ssm get-command-invocation --region '${params.AWS_REGION}' \\
          --command-id \"\$command_id\" --instance-id '${params.EC2_INSTANCE_ID}' \\
          --query Status --output text 2>/dev/null || true)
        case \"\$status\" in
          Success)
            aws ssm get-command-invocation --region '${params.AWS_REGION}' \\
              --command-id \"\$command_id\" --instance-id '${params.EC2_INSTANCE_ID}' \\
              --query StandardOutputContent --output text
            exit 0
            ;;
          Failed|Cancelled|TimedOut|Cancelling)
            aws ssm get-command-invocation --region '${params.AWS_REGION}' \\
              --command-id \"\$command_id\" --instance-id '${params.EC2_INSTANCE_ID}' \\
              --query StandardOutputContent --output text || true
            aws ssm get-command-invocation --region '${params.AWS_REGION}' \\
              --command-id \"\$command_id\" --instance-id '${params.EC2_INSTANCE_ID}' \\
              --query StandardErrorContent --output text || true
            exit 1
            ;;
        esac
        attempt=\$((attempt + 1))
        sleep 3
      done
      echo 'Timed out waiting for the EC2 SSM command.' >&2
      exit 1
    """
  }
}
