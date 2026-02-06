import * as cdk from 'aws-cdk-lib';
import { ImageStack } from '../lib/image-stack';

const app = new cdk.App();

new ImageStack(app, 'ImageEngineStack', {
  env: {
    region: 'ap-south-1'
  }
});
