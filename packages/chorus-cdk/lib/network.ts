import { Construct } from 'constructs';
import { aws_ec2 as ec2 } from 'aws-cdk-lib';
import { GatewayVpcEndpointAwsService, Vpc } from 'aws-cdk-lib/aws-ec2';

interface NetworkProps {
  vpcCidr?: string;
}

export class Network extends Construct {
  readonly vpc: Vpc;
  readonly dbSecurityGroup: ec2.SecurityGroup;
  readonly serviceSecurityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: NetworkProps) {
    super(scope, id);

    this.vpc = new ec2.Vpc(this, 'Vpc', {
      maxAzs: 2,
      natGateways: 1,
      cidr: props.vpcCidr ?? '10.1.0.0/16',
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: 'private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
      ],
    });

    this.vpc.addGatewayEndpoint('S3Endpoint', {
      service: GatewayVpcEndpointAwsService.S3,
      subnets: [
        this.vpc.selectSubnets({
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        }),
      ],
    });

    this.serviceSecurityGroup = new ec2.SecurityGroup(
      this,
      'ServiceSecurityGroup',
      {
        vpc: this.vpc,
        description: 'Security group for ECS Fargate service',
      },
    );

    this.serviceSecurityGroup.addIngressRule(
      this.serviceSecurityGroup,
      ec2.Port.tcp(5432),
      'Allow RDS proxy connection from same security group',
    );

    this.dbSecurityGroup = new ec2.SecurityGroup(this, 'DBSecurityGroup', {
      vpc: this.vpc,
    });

    this.dbSecurityGroup.addIngressRule(
      this.serviceSecurityGroup,
      ec2.Port.tcp(5432),
      'Allow PostgreSQL access from service security group',
    );
  }
}
