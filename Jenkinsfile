pipeline {
    agent any // Or specify a label for your Jenkins agent

    stages {
        stage('Checkout Source') {
            steps {
                checkout scm // Checks out code from the configured SCM (e.g., Git)
            }
        }

        stage('Docker Build + Tag') {
            steps {
                script {
                    def imageName = 'poojapooja123/kanban-dashboard-app'
                    // Build and tag with Jenkins build number
                    sh "docker build -t ${imageName}:${env.BUILD_NUMBER} ."
                    // Add a 'latest' tag as well
                    sh "docker tag ${imageName}:${env.BUILD_NUMBER} ${imageName}:latest"
                    echo "Docker image built: ${imageName}:${env.BUILD_NUMBER} and ${imageName}:latest"
                }
            }
        }

        stage('Registry Login + Push') {
            steps {
                script {
                    def imageName = 'poojapooja123/kanban-dashboard-app'
                    withCredentials([
                        usernamePassword(credentialsId: 'dockerhub-creds', passwordVariable: 'ganesanganesan123', usernameVariable: 'poojapooja123')
                    ]) {
                        sh "echo \"$DOCKER_PASSWORD\" | docker login -u \"$DOCKER_USERNAME\" --password-stdin"
                        sh "docker push ${imageName}:${env.BUILD_NUMBER}"
                        sh "docker push ${imageName}:latest"
                    }
                    echo "Docker images pushed to registry."
                }
            }
        }

        stage('Deploy to EC2') {
            steps {
                script {
                    def imageName = 'poojapooja123/kanban-dashboard-app'
                    def ec2User = 'ubuntu' 
                    def ec2Ip = '13.234.21.10'  

                    withCredentials([sshUserPrivateKey(credentialsId: 'ec2-ssh-key', keyFileVariable: 'SSH_KEY_FILE')]) {
                        echo "Attempting to deploy to EC2 instance: ${ec2Ip}"
                        // Stop and remove existing container, then pull and run the new one
                        sh "ssh -o StrictHostKeyChecking=no -i ${SSH_KEY_FILE} ${ec2User}@${ec2Ip} 'docker stop kanban-dashboard || true && docker rm kanban-dashboard || true'"
                        sh "ssh -o StrictHostKeyChecking=no -i ${SSH_KEY_FILE} ${ec2User}@${ec2Ip} 'docker pull ${imageName}:${env.BUILD_NUMBER}'"
                        sh "ssh -o StrictHostKeyChecking=no -i ${SSH_KEY_FILE} ${ec2User}@${ec2Ip} 'docker run -d --name kanban-dashboard -p 80:80 ${imageName}:${env.BUILD_NUMBER}'"
                    }
                    echo "Deployment to EC2 initiated."
                }
            }
        }

        stage('Health Check New Container') {
            steps {
                script {
                    def ec2Ip = '13.234.21.10' 
                    def appPort = 3000 // Port your application listens on
                    def maxAttempts = 10
                    def delaySeconds = 10
                    
                    echo "Starting health check on http://${ec2Ip}:${appPort}"
                    for (int i = 0; i < maxAttempts; i++) {
                        try {
                            // Use curl on Jenkins agent to check the deployed app
                            sh "curl -f http://${ec2Ip}:${appPort}/health || exit 1"
                            echo "Health check successful!"
                            break // Exit loop on success
                        } catch (Exception e) {
                            if (i == maxAttempts - 1) {
                                error "Health check failed after ${maxAttempts} attempts."
                            }
                            echo "Health check failed (attempt ${i + 1}/${maxAttempts}), retrying in ${delaySeconds} seconds..."
                            sleep delaySeconds
                        }
                    }
                }
            }
        }

        stage('Mark Success/Fail, Trigger Rollback on Fail') {
            steps {
                script {
                    // This stage acts more as a conditional post-build action.
                    // Jenkins pipeline will automatically mark the build as failed if any previous step fails.
                    // For explicit success/failure logging:
                    echo "Pipeline finished. Check previous stages for detailed status."
                }
            }
            // This post-action block demonstrates conditional actions
            post {
                success {
                    echo 'Pipeline successful! Application deployed and healthy.'
                    // Add any success notifications here
                }
                failure {
                    echo 'Pipeline failed! Initiating rollback procedures (if defined).' 
                    // You can call a separate rollback function or stage here
                    // For example, trigger another job, or run commands to revert to a previous version
                    // sh 'python rollback_script.py'
                    currentBuild.result = 'FAILURE'
                }
                unstable {
                    echo 'Pipeline finished with some issues (unstable).' // e.g., if tests failed but build passed
                }
                always {
                    echo 'This always runs regardless of build status.'
                }
            }
        }
    }
}
