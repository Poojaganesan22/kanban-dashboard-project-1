pipeline {
    agent any

    stages {
        stage('Install and Build') {
            steps {
                sh 'npm ci'
                sh 'npm run build'
            }
        }
    }
}
