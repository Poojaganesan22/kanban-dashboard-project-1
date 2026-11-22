pipeline {
    agent any
 }
   stage('Checkout Source') {
    steps {
        git branch: 'main', url: 'https://github.com/Poojaganesan22/kanban-dashboard-project-1.git'
        // Or if your Jenkinsfile is in the repo, you might just need:
        // checkout scm
    }
}
 stage('Docker Build') {
    steps {
        script {
            def imageName = 'poojapooja123/kanban-dashboard-app'
            // Build and tag with Jenkins build number
            sh "docker build -t ${imageName}:${env.BUILD_NUMBER} ."
            // Add a 'latest' tag to the image you just built
            sh "docker tag ${imageName}:${env.BUILD_NUMBER} ${imageName}:latest"
        }
    }
}
stage('Registry Login + Push') {
    steps {
        script {
            def imageName = 'poojapooja123/kanban-dashboard-app'
            // Use withCredentials to securely inject Docker Hub credentials
            withCredentials([
                usernamePassword(credentialsId: 'dockerhub-creds', passwordVariable: 'DOCKER_PASSWORD', usernameVariable: 'DOCKER_USERNAME')
            ]) {
                sh "echo \"$DOCKER_PASSWORD\" | docker login -u \"$DOCKER_USERNAME\" --password-stdin"
                sh "docker push ${imageName}:${env.BUILD_NUMBER}"
                sh "docker push ${imageName}:latest"
            }
        }
    }
}

