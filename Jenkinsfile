pipeline {
    agent any

    options {
        timestamps()
        disableConcurrentBuilds()
        skipDefaultCheckout(true)
    }

    environment {
        IMAGE_NAME = 'poojapooja123/kanban-dashboard'
        EC2_HOST = '13.234.21.10'
        APP_PORT = '3000'
        HEALTH_PATH = '/'
        CONTAINER_NAME = 'kanban-dashboard-app'
        DEPLOY_ATTEMPTED = 'false'
    }

    stages {
        stage('Checkout source') {
            steps {
                checkout scm
                script {
                    env.GIT_SHA = sh(
                        script: 'git rev-parse --short HEAD',
                        returnStdout: true
                    ).trim()
                    env.IMAGE_TAG = "${env.BUILD_NUMBER}-${env.GIT_SHA}"
                    env.FULL_IMAGE = "${env.IMAGE_NAME}:${env.IMAGE_TAG}"
                }
            }
        }
        stage('Docker build + tag') {
            steps {
                sh '''
                    set -eu
                    docker build \\
                      -t "$FULL_IMAGE" \\
                      -t "$IMAGE_NAME:$BUILD_NUMBER" .
                '''
            }
        }

        stage('Registry login + push') {
            steps {
                withCredentials([usernamePassword(
                    credentialsId: 'dockerhub-creds',
                    usernameVariable: 'DOCKER_USERNAME',
                    passwordVariable: 'DOCKER_TOKEN'
                )]) {
                    sh '''
                        set +x
                        printf '%s' "$DOCKER_TOKEN" |
                          docker login --username "$DOCKER_USERNAME" --password-stdin
                        docker push "$FULL_IMAGE"
                        docker push "$IMAGE_NAME:$BUILD_NUMBER"
                    '''
                }
            }
        }

        stage('Deploy to EC2') {
            steps {
                script {
                    writeFile file: 'remote-deploy.sh', text: '''#!/bin/sh
set -eu
mode=$1
image=$2
container=$3
port=$4
health_path=$5
build_number=$6
candidate="${container}-candidate"
backup="${container}-previous-${build_number}"
state_file="/tmp/kanban-${build_number}.had-previous"

case "$mode" in
  deploy)
    sudo docker pull "$image"
    sudo docker rm -f "$candidate" >/dev/null 2>&1 || true
    if sudo docker inspect "$container" >/dev/null 2>&1; then
      echo yes > "$state_file"
      sudo docker stop "$container" >/dev/null 2>&1 || true
    else
      echo no > "$state_file"
    fi
    if ! sudo docker run -d --name "$candidate" --restart unless-stopped \\
      -p "${port}:${port}" "$image"; then
      if [ "$(cat "$state_file")" = yes ]; then
        sudo docker start "$container" >/dev/null 2>&1 || true
      fi
      exit 1
    fi
    ;;
  check)
    attempt=0
    until curl --fail --silent "http://127.0.0.1:${port}${health_path}" >/dev/null; do
      attempt=$((attempt + 1))
      if [ "$attempt" -ge 30 ]; then
        sudo docker logs --tail 100 "$candidate" || true
        echo "Health check failed."
        exit 1
      fi
      sleep 2
    done
    ;;
  promote)
    if [ "$(cat "$state_file")" = yes ]; then sudo docker rename "$container" "$backup"; fi
    if ! sudo docker rename "$candidate" "$container"; then
      if [ "$(cat "$state_file")" = yes ]; then sudo docker rename "$backup" "$container"; fi
      exit 1
    fi
    if [ "$(cat "$state_file")" = yes ]; then sudo docker rm "$backup"; fi
    rm -f "$state_file"
    ;;
  rollback)
    sudo docker rm -f "$candidate" >/dev/null 2>&1 || true
    if sudo docker inspect "$backup" >/dev/null 2>&1; then
      sudo docker rm -f "$container" >/dev/null 2>&1 || true
      sudo docker rename "$backup" "$container"
      sudo docker start "$container"
    elif [ -f "$state_file" ] && [ "$(cat "$state_file")" = yes ]; then
      sudo docker start "$container" >/dev/null 2>&1 || true
    else
      echo "No previous container was available."
    fi
    rm -f "$state_file"
    ;;
esac
'''
                    env.DEPLOY_ATTEMPTED = 'true'
                    runRemote('deploy')
                }
            }
        }

        stage('Health check new container') {
            steps {
                script {
                    runRemote('check')
                }
            }
        }

        stage('Mark success') {
            steps {
                script {
                    runRemote('promote')
                }
                echo 'Health check passed; deployment succeeded.'
            }
        }
    }

    post {
        failure {
            echo 'Pipeline failed. Attempting EC2 rollback.'
            script {
                if (env.DEPLOY_ATTEMPTED == 'true') {
                    catchError(buildResult: 'FAILURE', stageResult: 'FAILURE') {
                        runRemote('rollback')
                    }
                }
            }
        }
        success {
            echo "SUCCESS: deployed ${env.FULL_IMAGE}"
        }
    }
}

def runRemote(String operation) {
    withCredentials([sshUserPrivateKey(
        credentialsId: 'ec2-ssh-key',
        keyFileVariable: 'SSH_KEY_FILE',
        usernameVariable: 'SSH_USER'
    )]) {
        sh """
            set -eu
            chmod 600 \$SSH_KEY_FILE
            ssh -i \$SSH_KEY_FILE -o BatchMode=yes -o StrictHostKeyChecking=accept-new \\
              \$SSH_USER@${env.EC2_HOST} \\
              "sh -s -- '${operation}' '${env.FULL_IMAGE}' '${env.CONTAINER_NAME}' '${env.APP_PORT}' '${env.HEALTH_PATH}' '${env.BUILD_NUMBER}'" \\
              < remote-deploy.sh
        """
    }
}
