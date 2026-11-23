pipeline {
    agent any

    environment {
        DOCKER_REGISTRY = "docker.io"
        DOCKER_REPO     = "${DOCKER_USER}/kanban-dashboard"
        GIT_SHORT_SHA   = sh(script: "git rev-parse --short HEAD", returnStdout: true).trim()
        IMAGE_TAG       = "${BUILD_NUMBER}-${GIT_SHORT_SHA}"
        FULL_IMAGE      = "${DOCKER_REPO}:${IMAGE_TAG}"
        APP_PORT        = "3000"
        CONTAINER_BASE  = "kanban-dashboard"
        MEMORY_LIMIT    = "256m"
        CPU_LIMIT       = "0.5"
    }

    options {
        buildDiscarder(logRotator(numToKeepStr: '10'))
        timeout(time: 15, unit: 'MINUTES')
        timestamps()
    }

    stages {
        stage('1. Checkout Source') {
            steps {
                checkout scm
                sh '''
                    echo "Building Commit: $(git rev-parse HEAD)"
                    echo "Image Tag: ${FULL_IMAGE}"
                '''
            }
        }

        stage('2. Docker Build & Tag') {
            steps {
                script {
                    sh '''
                        docker build \
                            --no-cache \
                            -t ${FULL_IMAGE} \
                            -t ${DOCKER_REPO}:latest .
                    '''
                }
            }
        }

        stage('3. Security & Non-Root Verification') {
            steps {
                sh '''
                    echo "Verifying non-root user inside image..."
                    IMAGE_USER=$(docker inspect --format='{{.Config.User}}' ${FULL_IMAGE})
                    echo "Configured Container User: ${IMAGE_USER}"
                    if [ -z "${IMAGE_USER}" ] || [ "${IMAGE_USER}" = "root" ] || [ "${IMAGE_USER}" = "0" ]; then
                        echo "ERROR: Container must not run as root!"
                        exit 1
                    fi
                '''
            }
        }

        stage('4. Push to Container Registry') {
            steps {
                withCredentials([usernamePassword(
                    credentialsId: 'dockerhub-credentials',
                    usernameVariable: 'DOCKER_USER',
                    passwordVariable: 'DOCKER_PASS'
                )]) {
                    sh '''
                        echo "$DOCKER_PASS" | docker login -u "$DOCKER_USER" --password-stdin
                        docker push ${DOCKER_USER}/kanban-dashboard:${IMAGE_TAG}
                        docker push ${DOCKER_USER}/kanban-dashboard:latest
                        docker logout
                    '''
                }
            }
        }

        stage('5. Zero-Downtime Deploy & Health Check') {
            steps {
                withCredentials([usernamePassword(
                    credentialsId: 'dockerhub-credentials',
                    usernameVariable: 'DOCKER_USER',
                    passwordVariable: 'DOCKER_PASS'
                )]) {
                    sh '''
                        chmod +x scripts/deploy.sh
                        ./scripts/deploy.sh "${DOCKER_USER}/kanban-dashboard:${IMAGE_TAG}" "${APP_PORT}" "${MEMORY_LIMIT}" "${CPU_LIMIT}"
                    '''
                }
            }
        }
    }

    post {
        success {
            echo "SUCCESS: ${FULL_IMAGE} deployed, health-checked, and serving live traffic!"
        }
        failure {
            echo "FAILURE: Pipeline failed! Rollback logic preserved previous healthy container (if available)."
        }
        always {
            sh 'docker image prune -f || true'
        }
    }
}
