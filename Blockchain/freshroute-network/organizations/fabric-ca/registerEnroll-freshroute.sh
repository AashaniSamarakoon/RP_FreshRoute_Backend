#!/usr/bin/env bash

# FreshRoute Network - Certificate Enrollment Script
# Creates certificates for Farmer, Buyer, and Transporter organizations

function createFarmer() {
  infoln "Enrolling the CA admin for Farmer Organization"
  mkdir -p organizations/peerOrganizations/farmer.freshroute.com/

  export FABRIC_CA_CLIENT_HOME=${PWD}/organizations/peerOrganizations/farmer.freshroute.com/

  set -x
  fabric-ca-client enroll -u https://admin:adminpw@localhost:7054 --caname ca-farmer --tls.certfiles "${PWD}/organizations/fabric-ca/farmer/ca-cert.pem"
  { set +x; } 2>/dev/null

  echo 'NodeOUs:
  Enable: true
  ClientOUIdentifier:
    Certificate: cacerts/localhost-7054-ca-farmer.pem
    OrganizationalUnitIdentifier: client
  PeerOUIdentifier:
    Certificate: cacerts/localhost-7054-ca-farmer.pem
    OrganizationalUnitIdentifier: peer
  AdminOUIdentifier:
    Certificate: cacerts/localhost-7054-ca-farmer.pem
    OrganizationalUnitIdentifier: admin
  OrdererOUIdentifier:
    Certificate: cacerts/localhost-7054-ca-farmer.pem
    OrganizationalUnitIdentifier: orderer' > "${PWD}/organizations/peerOrganizations/farmer.freshroute.com/msp/config.yaml"

  # Copy farmer's CA cert to MSP directories
  mkdir -p "${PWD}/organizations/peerOrganizations/farmer.freshroute.com/msp/tlscacerts"
  cp "${PWD}/organizations/fabric-ca/farmer/ca-cert.pem" "${PWD}/organizations/peerOrganizations/farmer.freshroute.com/msp/tlscacerts/ca.crt"

  mkdir -p "${PWD}/organizations/peerOrganizations/farmer.freshroute.com/tlsca"
  cp "${PWD}/organizations/fabric-ca/farmer/ca-cert.pem" "${PWD}/organizations/peerOrganizations/farmer.freshroute.com/tlsca/tlsca.farmer.freshroute.com-cert.pem"

  mkdir -p "${PWD}/organizations/peerOrganizations/farmer.freshroute.com/ca"
  cp "${PWD}/organizations/fabric-ca/farmer/ca-cert.pem" "${PWD}/organizations/peerOrganizations/farmer.freshroute.com/ca/ca.farmer.freshroute.com-cert.pem"

  # Register and enroll peer0
  infoln "Registering peer0 for Farmer"
  set -x
  fabric-ca-client register --caname ca-farmer --id.name peer0 --id.secret peer0pw --id.type peer --tls.certfiles "${PWD}/organizations/fabric-ca/farmer/ca-cert.pem"
  { set +x; } 2>/dev/null

  infoln "Generating peer0 MSP for Farmer"
  set -x
  fabric-ca-client enroll -u https://peer0:peer0pw@localhost:7054 --caname ca-farmer -M "${PWD}/organizations/peerOrganizations/farmer.freshroute.com/peers/peer0.farmer.freshroute.com/msp" --tls.certfiles "${PWD}/organizations/fabric-ca/farmer/ca-cert.pem"
  { set +x; } 2>/dev/null

  cp "${PWD}/organizations/peerOrganizations/farmer.freshroute.com/msp/config.yaml" "${PWD}/organizations/peerOrganizations/farmer.freshroute.com/peers/peer0.farmer.freshroute.com/msp/config.yaml"

  infoln "Generating peer0 TLS certificates for Farmer"
  set -x
  fabric-ca-client enroll -u https://peer0:peer0pw@localhost:7054 --caname ca-farmer -M "${PWD}/organizations/peerOrganizations/farmer.freshroute.com/peers/peer0.farmer.freshroute.com/tls" --enrollment.profile tls --csr.hosts peer0.farmer.freshroute.com --csr.hosts localhost --tls.certfiles "${PWD}/organizations/fabric-ca/farmer/ca-cert.pem"
  { set +x; } 2>/dev/null

  cp "${PWD}/organizations/peerOrganizations/farmer.freshroute.com/peers/peer0.farmer.freshroute.com/tls/tlscacerts/"* "${PWD}/organizations/peerOrganizations/farmer.freshroute.com/peers/peer0.farmer.freshroute.com/tls/ca.crt"
  cp "${PWD}/organizations/peerOrganizations/farmer.freshroute.com/peers/peer0.farmer.freshroute.com/tls/signcerts/"* "${PWD}/organizations/peerOrganizations/farmer.freshroute.com/peers/peer0.farmer.freshroute.com/tls/server.crt"
  cp "${PWD}/organizations/peerOrganizations/farmer.freshroute.com/peers/peer0.farmer.freshroute.com/tls/keystore/"* "${PWD}/organizations/peerOrganizations/farmer.freshroute.com/peers/peer0.farmer.freshroute.com/tls/server.key"

  # Register and enroll peer1
  infoln "Registering peer1 for Farmer"
  set -x
  fabric-ca-client register --caname ca-farmer --id.name peer1 --id.secret peer1pw --id.type peer --tls.certfiles "${PWD}/organizations/fabric-ca/farmer/ca-cert.pem"
  { set +x; } 2>/dev/null

  infoln "Generating peer1 MSP for Farmer"
  set -x
  fabric-ca-client enroll -u https://peer1:peer1pw@localhost:7054 --caname ca-farmer -M "${PWD}/organizations/peerOrganizations/farmer.freshroute.com/peers/peer1.farmer.freshroute.com/msp" --tls.certfiles "${PWD}/organizations/fabric-ca/farmer/ca-cert.pem"
  { set +x; } 2>/dev/null

  cp "${PWD}/organizations/peerOrganizations/farmer.freshroute.com/msp/config.yaml" "${PWD}/organizations/peerOrganizations/farmer.freshroute.com/peers/peer1.farmer.freshroute.com/msp/config.yaml"

  infoln "Generating peer1 TLS certificates for Farmer"
  set -x
  fabric-ca-client enroll -u https://peer1:peer1pw@localhost:7054 --caname ca-farmer -M "${PWD}/organizations/peerOrganizations/farmer.freshroute.com/peers/peer1.farmer.freshroute.com/tls" --enrollment.profile tls --csr.hosts peer1.farmer.freshroute.com --csr.hosts localhost --tls.certfiles "${PWD}/organizations/fabric-ca/farmer/ca-cert.pem"
  { set +x; } 2>/dev/null

  cp "${PWD}/organizations/peerOrganizations/farmer.freshroute.com/peers/peer1.farmer.freshroute.com/tls/tlscacerts/"* "${PWD}/organizations/peerOrganizations/farmer.freshroute.com/peers/peer1.farmer.freshroute.com/tls/ca.crt"
  cp "${PWD}/organizations/peerOrganizations/farmer.freshroute.com/peers/peer1.farmer.freshroute.com/tls/signcerts/"* "${PWD}/organizations/peerOrganizations/farmer.freshroute.com/peers/peer1.farmer.freshroute.com/tls/server.crt"
  cp "${PWD}/organizations/peerOrganizations/farmer.freshroute.com/peers/peer1.farmer.freshroute.com/tls/keystore/"* "${PWD}/organizations/peerOrganizations/farmer.freshroute.com/peers/peer1.farmer.freshroute.com/tls/server.key"

  # Register user with role attribute
  infoln "Registering user for Farmer"
  set -x
  fabric-ca-client register --caname ca-farmer --id.name user1 --id.secret user1pw --id.type client --id.attrs 'role=farmer:ecert' --tls.certfiles "${PWD}/organizations/fabric-ca/farmer/ca-cert.pem"
  { set +x; } 2>/dev/null

  infoln "Generating user MSP for Farmer"
  set -x
  fabric-ca-client enroll -u https://user1:user1pw@localhost:7054 --caname ca-farmer -M "${PWD}/organizations/peerOrganizations/farmer.freshroute.com/users/User1@farmer.freshroute.com/msp" --tls.certfiles "${PWD}/organizations/fabric-ca/farmer/ca-cert.pem"
  { set +x; } 2>/dev/null

  cp "${PWD}/organizations/peerOrganizations/farmer.freshroute.com/msp/config.yaml" "${PWD}/organizations/peerOrganizations/farmer.freshroute.com/users/User1@farmer.freshroute.com/msp/config.yaml"

  # Register and enroll admin
  infoln "Registering admin for Farmer"
  set -x
  fabric-ca-client register --caname ca-farmer --id.name farmeradmin --id.secret farmeradminpw --id.type admin --id.attrs 'role=farmer:ecert' --tls.certfiles "${PWD}/organizations/fabric-ca/farmer/ca-cert.pem"
  { set +x; } 2>/dev/null

  infoln "Generating admin MSP for Farmer"
  set -x
  fabric-ca-client enroll -u https://farmeradmin:farmeradminpw@localhost:7054 --caname ca-farmer -M "${PWD}/organizations/peerOrganizations/farmer.freshroute.com/users/Admin@farmer.freshroute.com/msp" --tls.certfiles "${PWD}/organizations/fabric-ca/farmer/ca-cert.pem"
  { set +x; } 2>/dev/null

  cp "${PWD}/organizations/peerOrganizations/farmer.freshroute.com/msp/config.yaml" "${PWD}/organizations/peerOrganizations/farmer.freshroute.com/users/Admin@farmer.freshroute.com/msp/config.yaml"
}

function createBuyer() {
  infoln "Enrolling the CA admin for Buyer Organization"
  mkdir -p organizations/peerOrganizations/buyer.freshroute.com/

  export FABRIC_CA_CLIENT_HOME=${PWD}/organizations/peerOrganizations/buyer.freshroute.com/

  set -x
  fabric-ca-client enroll -u https://admin:adminpw@localhost:8054 --caname ca-buyer --tls.certfiles "${PWD}/organizations/fabric-ca/buyer/ca-cert.pem"
  { set +x; } 2>/dev/null

  echo 'NodeOUs:
  Enable: true
  ClientOUIdentifier:
    Certificate: cacerts/localhost-8054-ca-buyer.pem
    OrganizationalUnitIdentifier: client
  PeerOUIdentifier:
    Certificate: cacerts/localhost-8054-ca-buyer.pem
    OrganizationalUnitIdentifier: peer
  AdminOUIdentifier:
    Certificate: cacerts/localhost-8054-ca-buyer.pem
    OrganizationalUnitIdentifier: admin
  OrdererOUIdentifier:
    Certificate: cacerts/localhost-8054-ca-buyer.pem
    OrganizationalUnitIdentifier: orderer' > "${PWD}/organizations/peerOrganizations/buyer.freshroute.com/msp/config.yaml"

  # Copy buyer's CA cert to MSP directories
  mkdir -p "${PWD}/organizations/peerOrganizations/buyer.freshroute.com/msp/tlscacerts"
  cp "${PWD}/organizations/fabric-ca/buyer/ca-cert.pem" "${PWD}/organizations/peerOrganizations/buyer.freshroute.com/msp/tlscacerts/ca.crt"

  mkdir -p "${PWD}/organizations/peerOrganizations/buyer.freshroute.com/tlsca"
  cp "${PWD}/organizations/fabric-ca/buyer/ca-cert.pem" "${PWD}/organizations/peerOrganizations/buyer.freshroute.com/tlsca/tlsca.buyer.freshroute.com-cert.pem"

  mkdir -p "${PWD}/organizations/peerOrganizations/buyer.freshroute.com/ca"
  cp "${PWD}/organizations/fabric-ca/buyer/ca-cert.pem" "${PWD}/organizations/peerOrganizations/buyer.freshroute.com/ca/ca.buyer.freshroute.com-cert.pem"

  # Register and enroll peer0
  infoln "Registering peer0 for Buyer"
  set -x
  fabric-ca-client register --caname ca-buyer --id.name peer0 --id.secret peer0pw --id.type peer --tls.certfiles "${PWD}/organizations/fabric-ca/buyer/ca-cert.pem"
  { set +x; } 2>/dev/null

  infoln "Generating peer0 MSP for Buyer"
  set -x
  fabric-ca-client enroll -u https://peer0:peer0pw@localhost:8054 --caname ca-buyer -M "${PWD}/organizations/peerOrganizations/buyer.freshroute.com/peers/peer0.buyer.freshroute.com/msp" --tls.certfiles "${PWD}/organizations/fabric-ca/buyer/ca-cert.pem"
  { set +x; } 2>/dev/null

  cp "${PWD}/organizations/peerOrganizations/buyer.freshroute.com/msp/config.yaml" "${PWD}/organizations/peerOrganizations/buyer.freshroute.com/peers/peer0.buyer.freshroute.com/msp/config.yaml"

  infoln "Generating peer0 TLS certificates for Buyer"
  set -x
  fabric-ca-client enroll -u https://peer0:peer0pw@localhost:8054 --caname ca-buyer -M "${PWD}/organizations/peerOrganizations/buyer.freshroute.com/peers/peer0.buyer.freshroute.com/tls" --enrollment.profile tls --csr.hosts peer0.buyer.freshroute.com --csr.hosts localhost --tls.certfiles "${PWD}/organizations/fabric-ca/buyer/ca-cert.pem"
  { set +x; } 2>/dev/null

  cp "${PWD}/organizations/peerOrganizations/buyer.freshroute.com/peers/peer0.buyer.freshroute.com/tls/tlscacerts/"* "${PWD}/organizations/peerOrganizations/buyer.freshroute.com/peers/peer0.buyer.freshroute.com/tls/ca.crt"
  cp "${PWD}/organizations/peerOrganizations/buyer.freshroute.com/peers/peer0.buyer.freshroute.com/tls/signcerts/"* "${PWD}/organizations/peerOrganizations/buyer.freshroute.com/peers/peer0.buyer.freshroute.com/tls/server.crt"
  cp "${PWD}/organizations/peerOrganizations/buyer.freshroute.com/peers/peer0.buyer.freshroute.com/tls/keystore/"* "${PWD}/organizations/peerOrganizations/buyer.freshroute.com/peers/peer0.buyer.freshroute.com/tls/server.key"

  # Register and enroll peer1
  infoln "Registering peer1 for Buyer"
  set -x
  fabric-ca-client register --caname ca-buyer --id.name peer1 --id.secret peer1pw --id.type peer --tls.certfiles "${PWD}/organizations/fabric-ca/buyer/ca-cert.pem"
  { set +x; } 2>/dev/null

  infoln "Generating peer1 MSP for Buyer"
  set -x
  fabric-ca-client enroll -u https://peer1:peer1pw@localhost:8054 --caname ca-buyer -M "${PWD}/organizations/peerOrganizations/buyer.freshroute.com/peers/peer1.buyer.freshroute.com/msp" --tls.certfiles "${PWD}/organizations/fabric-ca/buyer/ca-cert.pem"
  { set +x; } 2>/dev/null

  cp "${PWD}/organizations/peerOrganizations/buyer.freshroute.com/msp/config.yaml" "${PWD}/organizations/peerOrganizations/buyer.freshroute.com/peers/peer1.buyer.freshroute.com/msp/config.yaml"

  infoln "Generating peer1 TLS certificates for Buyer"
  set -x
  fabric-ca-client enroll -u https://peer1:peer1pw@localhost:8054 --caname ca-buyer -M "${PWD}/organizations/peerOrganizations/buyer.freshroute.com/peers/peer1.buyer.freshroute.com/tls" --enrollment.profile tls --csr.hosts peer1.buyer.freshroute.com --csr.hosts localhost --tls.certfiles "${PWD}/organizations/fabric-ca/buyer/ca-cert.pem"
  { set +x; } 2>/dev/null

  cp "${PWD}/organizations/peerOrganizations/buyer.freshroute.com/peers/peer1.buyer.freshroute.com/tls/tlscacerts/"* "${PWD}/organizations/peerOrganizations/buyer.freshroute.com/peers/peer1.buyer.freshroute.com/tls/ca.crt"
  cp "${PWD}/organizations/peerOrganizations/buyer.freshroute.com/peers/peer1.buyer.freshroute.com/tls/signcerts/"* "${PWD}/organizations/peerOrganizations/buyer.freshroute.com/peers/peer1.buyer.freshroute.com/tls/server.crt"
  cp "${PWD}/organizations/peerOrganizations/buyer.freshroute.com/peers/peer1.buyer.freshroute.com/tls/keystore/"* "${PWD}/organizations/peerOrganizations/buyer.freshroute.com/peers/peer1.buyer.freshroute.com/tls/server.key"

  # Register user with role attribute
  infoln "Registering user for Buyer"
  set -x
  fabric-ca-client register --caname ca-buyer --id.name user1 --id.secret user1pw --id.type client --id.attrs 'role=buyer:ecert' --tls.certfiles "${PWD}/organizations/fabric-ca/buyer/ca-cert.pem"
  { set +x; } 2>/dev/null

  infoln "Generating user MSP for Buyer"
  set -x
  fabric-ca-client enroll -u https://user1:user1pw@localhost:8054 --caname ca-buyer -M "${PWD}/organizations/peerOrganizations/buyer.freshroute.com/users/User1@buyer.freshroute.com/msp" --tls.certfiles "${PWD}/organizations/fabric-ca/buyer/ca-cert.pem"
  { set +x; } 2>/dev/null

  cp "${PWD}/organizations/peerOrganizations/buyer.freshroute.com/msp/config.yaml" "${PWD}/organizations/peerOrganizations/buyer.freshroute.com/users/User1@buyer.freshroute.com/msp/config.yaml"

  # Register and enroll admin
  infoln "Registering admin for Buyer"
  set -x
  fabric-ca-client register --caname ca-buyer --id.name buyeradmin --id.secret buyeradminpw --id.type admin --id.attrs 'role=buyer:ecert' --tls.certfiles "${PWD}/organizations/fabric-ca/buyer/ca-cert.pem"
  { set +x; } 2>/dev/null

  infoln "Generating admin MSP for Buyer"
  set -x
  fabric-ca-client enroll -u https://buyeradmin:buyeradminpw@localhost:8054 --caname ca-buyer -M "${PWD}/organizations/peerOrganizations/buyer.freshroute.com/users/Admin@buyer.freshroute.com/msp" --tls.certfiles "${PWD}/organizations/fabric-ca/buyer/ca-cert.pem"
  { set +x; } 2>/dev/null

  cp "${PWD}/organizations/peerOrganizations/buyer.freshroute.com/msp/config.yaml" "${PWD}/organizations/peerOrganizations/buyer.freshroute.com/users/Admin@buyer.freshroute.com/msp/config.yaml"
}

function createTransporter() {
  infoln "Enrolling the CA admin for Transporter Organization"
  mkdir -p organizations/peerOrganizations/transporter.freshroute.com/

  export FABRIC_CA_CLIENT_HOME=${PWD}/organizations/peerOrganizations/transporter.freshroute.com/

  set -x
  fabric-ca-client enroll -u https://admin:adminpw@localhost:9054 --caname ca-transporter --tls.certfiles "${PWD}/organizations/fabric-ca/transporter/ca-cert.pem"
  { set +x; } 2>/dev/null

  echo 'NodeOUs:
  Enable: true
  ClientOUIdentifier:
    Certificate: cacerts/localhost-9054-ca-transporter.pem
    OrganizationalUnitIdentifier: client
  PeerOUIdentifier:
    Certificate: cacerts/localhost-9054-ca-transporter.pem
    OrganizationalUnitIdentifier: peer
  AdminOUIdentifier:
    Certificate: cacerts/localhost-9054-ca-transporter.pem
    OrganizationalUnitIdentifier: admin
  OrdererOUIdentifier:
    Certificate: cacerts/localhost-9054-ca-transporter.pem
    OrganizationalUnitIdentifier: orderer' > "${PWD}/organizations/peerOrganizations/transporter.freshroute.com/msp/config.yaml"

  # Copy transporter's CA cert to MSP directories
  mkdir -p "${PWD}/organizations/peerOrganizations/transporter.freshroute.com/msp/tlscacerts"
  cp "${PWD}/organizations/fabric-ca/transporter/ca-cert.pem" "${PWD}/organizations/peerOrganizations/transporter.freshroute.com/msp/tlscacerts/ca.crt"

  mkdir -p "${PWD}/organizations/peerOrganizations/transporter.freshroute.com/tlsca"
  cp "${PWD}/organizations/fabric-ca/transporter/ca-cert.pem" "${PWD}/organizations/peerOrganizations/transporter.freshroute.com/tlsca/tlsca.transporter.freshroute.com-cert.pem"

  mkdir -p "${PWD}/organizations/peerOrganizations/transporter.freshroute.com/ca"
  cp "${PWD}/organizations/fabric-ca/transporter/ca-cert.pem" "${PWD}/organizations/peerOrganizations/transporter.freshroute.com/ca/ca.transporter.freshroute.com-cert.pem"

  # Register and enroll peer0
  infoln "Registering peer0 for Transporter"
  set -x
  fabric-ca-client register --caname ca-transporter --id.name peer0 --id.secret peer0pw --id.type peer --tls.certfiles "${PWD}/organizations/fabric-ca/transporter/ca-cert.pem"
  { set +x; } 2>/dev/null

  infoln "Generating peer0 MSP for Transporter"
  set -x
  fabric-ca-client enroll -u https://peer0:peer0pw@localhost:9054 --caname ca-transporter -M "${PWD}/organizations/peerOrganizations/transporter.freshroute.com/peers/peer0.transporter.freshroute.com/msp" --tls.certfiles "${PWD}/organizations/fabric-ca/transporter/ca-cert.pem"
  { set +x; } 2>/dev/null

  cp "${PWD}/organizations/peerOrganizations/transporter.freshroute.com/msp/config.yaml" "${PWD}/organizations/peerOrganizations/transporter.freshroute.com/peers/peer0.transporter.freshroute.com/msp/config.yaml"

  infoln "Generating peer0 TLS certificates for Transporter"
  set -x
  fabric-ca-client enroll -u https://peer0:peer0pw@localhost:9054 --caname ca-transporter -M "${PWD}/organizations/peerOrganizations/transporter.freshroute.com/peers/peer0.transporter.freshroute.com/tls" --enrollment.profile tls --csr.hosts peer0.transporter.freshroute.com --csr.hosts localhost --tls.certfiles "${PWD}/organizations/fabric-ca/transporter/ca-cert.pem"
  { set +x; } 2>/dev/null

  cp "${PWD}/organizations/peerOrganizations/transporter.freshroute.com/peers/peer0.transporter.freshroute.com/tls/tlscacerts/"* "${PWD}/organizations/peerOrganizations/transporter.freshroute.com/peers/peer0.transporter.freshroute.com/tls/ca.crt"
  cp "${PWD}/organizations/peerOrganizations/transporter.freshroute.com/peers/peer0.transporter.freshroute.com/tls/signcerts/"* "${PWD}/organizations/peerOrganizations/transporter.freshroute.com/peers/peer0.transporter.freshroute.com/tls/server.crt"
  cp "${PWD}/organizations/peerOrganizations/transporter.freshroute.com/peers/peer0.transporter.freshroute.com/tls/keystore/"* "${PWD}/organizations/peerOrganizations/transporter.freshroute.com/peers/peer0.transporter.freshroute.com/tls/server.key"

  # Register and enroll peer1
  infoln "Registering peer1 for Transporter"
  set -x
  fabric-ca-client register --caname ca-transporter --id.name peer1 --id.secret peer1pw --id.type peer --tls.certfiles "${PWD}/organizations/fabric-ca/transporter/ca-cert.pem"
  { set +x; } 2>/dev/null

  infoln "Generating peer1 MSP for Transporter"
  set -x
  fabric-ca-client enroll -u https://peer1:peer1pw@localhost:9054 --caname ca-transporter -M "${PWD}/organizations/peerOrganizations/transporter.freshroute.com/peers/peer1.transporter.freshroute.com/msp" --tls.certfiles "${PWD}/organizations/fabric-ca/transporter/ca-cert.pem"
  { set +x; } 2>/dev/null

  cp "${PWD}/organizations/peerOrganizations/transporter.freshroute.com/msp/config.yaml" "${PWD}/organizations/peerOrganizations/transporter.freshroute.com/peers/peer1.transporter.freshroute.com/msp/config.yaml"

  infoln "Generating peer1 TLS certificates for Transporter"
  set -x
  fabric-ca-client enroll -u https://peer1:peer1pw@localhost:9054 --caname ca-transporter -M "${PWD}/organizations/peerOrganizations/transporter.freshroute.com/peers/peer1.transporter.freshroute.com/tls" --enrollment.profile tls --csr.hosts peer1.transporter.freshroute.com --csr.hosts localhost --tls.certfiles "${PWD}/organizations/fabric-ca/transporter/ca-cert.pem"
  { set +x; } 2>/dev/null

  cp "${PWD}/organizations/peerOrganizations/transporter.freshroute.com/peers/peer1.transporter.freshroute.com/tls/tlscacerts/"* "${PWD}/organizations/peerOrganizations/transporter.freshroute.com/peers/peer1.transporter.freshroute.com/tls/ca.crt"
  cp "${PWD}/organizations/peerOrganizations/transporter.freshroute.com/peers/peer1.transporter.freshroute.com/tls/signcerts/"* "${PWD}/organizations/peerOrganizations/transporter.freshroute.com/peers/peer1.transporter.freshroute.com/tls/server.crt"
  cp "${PWD}/organizations/peerOrganizations/transporter.freshroute.com/peers/peer1.transporter.freshroute.com/tls/keystore/"* "${PWD}/organizations/peerOrganizations/transporter.freshroute.com/peers/peer1.transporter.freshroute.com/tls/server.key"

  # Register user with role attribute
  infoln "Registering user for Transporter"
  set -x
  fabric-ca-client register --caname ca-transporter --id.name user1 --id.secret user1pw --id.type client --id.attrs 'role=transporter:ecert' --tls.certfiles "${PWD}/organizations/fabric-ca/transporter/ca-cert.pem"
  { set +x; } 2>/dev/null

  infoln "Generating user MSP for Transporter"
  set -x
  fabric-ca-client enroll -u https://user1:user1pw@localhost:9054 --caname ca-transporter -M "${PWD}/organizations/peerOrganizations/transporter.freshroute.com/users/User1@transporter.freshroute.com/msp" --tls.certfiles "${PWD}/organizations/fabric-ca/transporter/ca-cert.pem"
  { set +x; } 2>/dev/null

  cp "${PWD}/organizations/peerOrganizations/transporter.freshroute.com/msp/config.yaml" "${PWD}/organizations/peerOrganizations/transporter.freshroute.com/users/User1@transporter.freshroute.com/msp/config.yaml"

  # Register and enroll admin
  infoln "Registering admin for Transporter"
  set -x
  fabric-ca-client register --caname ca-transporter --id.name transporteradmin --id.secret transporteradminpw --id.type admin --id.attrs 'role=transporter:ecert' --tls.certfiles "${PWD}/organizations/fabric-ca/transporter/ca-cert.pem"
  { set +x; } 2>/dev/null

  infoln "Generating admin MSP for Transporter"
  set -x
  fabric-ca-client enroll -u https://transporteradmin:transporteradminpw@localhost:9054 --caname ca-transporter -M "${PWD}/organizations/peerOrganizations/transporter.freshroute.com/users/Admin@transporter.freshroute.com/msp" --tls.certfiles "${PWD}/organizations/fabric-ca/transporter/ca-cert.pem"
  { set +x; } 2>/dev/null

  cp "${PWD}/organizations/peerOrganizations/transporter.freshroute.com/msp/config.yaml" "${PWD}/organizations/peerOrganizations/transporter.freshroute.com/users/Admin@transporter.freshroute.com/msp/config.yaml"
}

function createOrderer() {
  infoln "Enrolling the CA admin for Orderer Organization"
  mkdir -p organizations/ordererOrganizations/freshroute.com

  export FABRIC_CA_CLIENT_HOME=${PWD}/organizations/ordererOrganizations/freshroute.com

  set -x
  fabric-ca-client enroll -u https://admin:adminpw@localhost:10054 --caname ca-orderer --tls.certfiles "${PWD}/organizations/fabric-ca/ordererOrg/ca-cert.pem"
  { set +x; } 2>/dev/null

  echo 'NodeOUs:
  Enable: true
  ClientOUIdentifier:
    Certificate: cacerts/localhost-10054-ca-orderer.pem
    OrganizationalUnitIdentifier: client
  PeerOUIdentifier:
    Certificate: cacerts/localhost-10054-ca-orderer.pem
    OrganizationalUnitIdentifier: peer
  AdminOUIdentifier:
    Certificate: cacerts/localhost-10054-ca-orderer.pem
    OrganizationalUnitIdentifier: admin
  OrdererOUIdentifier:
    Certificate: cacerts/localhost-10054-ca-orderer.pem
    OrganizationalUnitIdentifier: orderer' > "${PWD}/organizations/ordererOrganizations/freshroute.com/msp/config.yaml"

  # Copy orderer CA certs
  mkdir -p "${PWD}/organizations/ordererOrganizations/freshroute.com/msp/tlscacerts"
  cp "${PWD}/organizations/fabric-ca/ordererOrg/ca-cert.pem" "${PWD}/organizations/ordererOrganizations/freshroute.com/msp/tlscacerts/tlsca.freshroute.com-cert.pem"

  mkdir -p "${PWD}/organizations/ordererOrganizations/freshroute.com/tlsca"
  cp "${PWD}/organizations/fabric-ca/ordererOrg/ca-cert.pem" "${PWD}/organizations/ordererOrganizations/freshroute.com/tlsca/tlsca.freshroute.com-cert.pem"

  # Loop through each orderer to register and generate artifacts
  for ORDERER in orderer orderer2 orderer3; do
    infoln "Registering ${ORDERER}"
    set -x
    fabric-ca-client register --caname ca-orderer --id.name ${ORDERER} --id.secret ${ORDERER}pw --id.type orderer --tls.certfiles "${PWD}/organizations/fabric-ca/ordererOrg/ca-cert.pem"
    { set +x; } 2>/dev/null

    infoln "Generating the ${ORDERER} MSP"
    set -x
    fabric-ca-client enroll -u https://${ORDERER}:${ORDERER}pw@localhost:10054 --caname ca-orderer -M "${PWD}/organizations/ordererOrganizations/freshroute.com/orderers/${ORDERER}.freshroute.com/msp" --tls.certfiles "${PWD}/organizations/fabric-ca/ordererOrg/ca-cert.pem"
    { set +x; } 2>/dev/null

    cp "${PWD}/organizations/ordererOrganizations/freshroute.com/msp/config.yaml" "${PWD}/organizations/ordererOrganizations/freshroute.com/orderers/${ORDERER}.freshroute.com/msp/config.yaml"

    # Rename signcert for consistency
    mv "${PWD}/organizations/ordererOrganizations/freshroute.com/orderers/${ORDERER}.freshroute.com/msp/signcerts/cert.pem" "${PWD}/organizations/ordererOrganizations/freshroute.com/orderers/${ORDERER}.freshroute.com/msp/signcerts/${ORDERER}.freshroute.com-cert.pem"

    infoln "Generating the ${ORDERER} TLS certificates"
    set -x
    fabric-ca-client enroll -u https://${ORDERER}:${ORDERER}pw@localhost:10054 --caname ca-orderer -M "${PWD}/organizations/ordererOrganizations/freshroute.com/orderers/${ORDERER}.freshroute.com/tls" --enrollment.profile tls --csr.hosts ${ORDERER}.freshroute.com --csr.hosts localhost --tls.certfiles "${PWD}/organizations/fabric-ca/ordererOrg/ca-cert.pem"
    { set +x; } 2>/dev/null

    # Copy TLS certificates to well-known names
    cp "${PWD}/organizations/ordererOrganizations/freshroute.com/orderers/${ORDERER}.freshroute.com/tls/tlscacerts/"* "${PWD}/organizations/ordererOrganizations/freshroute.com/orderers/${ORDERER}.freshroute.com/tls/ca.crt"
    cp "${PWD}/organizations/ordererOrganizations/freshroute.com/orderers/${ORDERER}.freshroute.com/tls/signcerts/"* "${PWD}/organizations/ordererOrganizations/freshroute.com/orderers/${ORDERER}.freshroute.com/tls/server.crt"
    cp "${PWD}/organizations/ordererOrganizations/freshroute.com/orderers/${ORDERER}.freshroute.com/tls/keystore/"* "${PWD}/organizations/ordererOrganizations/freshroute.com/orderers/${ORDERER}.freshroute.com/tls/server.key"

    # Copy orderer's TLS CA cert to MSP
    mkdir -p "${PWD}/organizations/ordererOrganizations/freshroute.com/orderers/${ORDERER}.freshroute.com/msp/tlscacerts"
    cp "${PWD}/organizations/ordererOrganizations/freshroute.com/orderers/${ORDERER}.freshroute.com/tls/tlscacerts/"* "${PWD}/organizations/ordererOrganizations/freshroute.com/orderers/${ORDERER}.freshroute.com/msp/tlscacerts/tlsca.freshroute.com-cert.pem"
  done

  # Register and enroll orderer admin
  infoln "Registering the orderer admin"
  set -x
  fabric-ca-client register --caname ca-orderer --id.name ordererAdmin --id.secret ordererAdminpw --id.type admin --tls.certfiles "${PWD}/organizations/fabric-ca/ordererOrg/ca-cert.pem"
  { set +x; } 2>/dev/null

  infoln "Generating the orderer admin MSP"
  set -x
  fabric-ca-client enroll -u https://ordererAdmin:ordererAdminpw@localhost:10054 --caname ca-orderer -M "${PWD}/organizations/ordererOrganizations/freshroute.com/users/Admin@freshroute.com/msp" --tls.certfiles "${PWD}/organizations/fabric-ca/ordererOrg/ca-cert.pem"
  { set +x; } 2>/dev/null

  cp "${PWD}/organizations/ordererOrganizations/freshroute.com/msp/config.yaml" "${PWD}/organizations/ordererOrganizations/freshroute.com/users/Admin@freshroute.com/msp/config.yaml"
}
