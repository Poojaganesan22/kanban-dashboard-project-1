pipeline {
    agent any
 }
   stages {
    stage('checkout') {
        steps {
            checkout scm
    
        }
    }

 }
   stage('Docker build and tag') {
    steps {
        script {
            def gitSha = sh(
                script: 'git rev-parse --short HEAD',
                returnStdout: true
            ).trim()

            def image = "poojapooja123/kanban-dashboard:1 :${env.BUILD_NUMBER}-${gitSha}"

            sh """
                docker build -t ${image} .
            """
        }
    }
 }
    stage('Registry login + push') {
    steps {
        withCredentials([usernamePassword(
            credentialsId: 'dockerhub-creds',
            usernameVariable: 'poojapooja123',
            passwordVariable: 'ganesanganesan123'
        )]) {
            sh '''
                echo "$REGISTRY_PASSWORD" |
                    docker login my-registry.example.com \
                        --username "$REGISTRY_USER" --password-stdin

                docker push my-registry.example.com/my-app:latest
            '''
        }
    }
 }
stage('Deploy to EC2') {
    steps {
        sshagent(credentials: ['ec2-ssh-key']) {
            sh '''
                ssh -o StrictHostKeyChecking=yes "$EC2_USER@$EC2_HOST" \
                  "docker pull my-registry.example.com/my-app:$BUILD_NUMBER &&
                   docker stop my-app || true;
                   docker rm my-app || true;
                   docker run -d --name my-app -p 8080:8080 \
                     my-registry.example.com/my-app:$BUILD_NUMBER"
            '''
        }
    }
 }
stage('Health check new container') {
    steps {
        sh '''
            ssh -o StrictHostKeyChecking=yes "$EC2_USER@$EC2_HOST" \
              'for i in $(seq 1 30); do
                 if curl --fail --silent http://localhost:8080/health; then
                   echo "Health check passed"
                   exit 0
                 fi
                 sleep 2
               done
               echo "Health check failed"
               exit 1'
        '''
    }
 }
stage('Mark success') {
    steps {
        echo 'Deploy and health check succeeded'
    }
 }

post {
    failure {
        echo 'Pipeline failed; rolling back on EC2'

        sshagent(credentials: ['ec2-ssh-key']) {
            sh '''
                ssh -o StrictHostKeyChecking=yes "$EC2_USER@$EC2_HOST" "
                    docker rm -f my-app || true
                    docker run -d --name my-app -p 8080:8080 '$PREVIOUS_IMAGE'
                "
            '''
        }
    }

    success {
        echo 'Pipeline completed successfully'
    }
}
