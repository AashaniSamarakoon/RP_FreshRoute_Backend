#!/bin/bash

function one_line_pem {
    echo "`awk 'NF {sub(/\\n/, ""); printf "%s\\\\\\\n",$0;}' $1`"
}

function json_ccp {
    local PP=$(one_line_pem $5)
    local CP=$(one_line_pem $6)
    sed -e "s/\${ORG}/$1/" \
        -e "s/\${ORGMSP}/$2/" \
        -e "s/\${P0PORT}/$3/" \
        -e "s/\${CAPORT}/$4/" \
        -e "s#\${PEERPEM}#$PP#" \
        -e "s#\${CAPEM}#$CP#" \
        organizations/ccp-template.json
}

function yaml_ccp {
    local PP=$(one_line_pem $5)
    local CP=$(one_line_pem $6)
    sed -e "s/\${ORG}/$1/" \
        -e "s/\${ORGMSP}/$2/" \
        -e "s/\${P0PORT}/$3/" \
        -e "s/\${CAPORT}/$4/" \
        -e "s#\${PEERPEM}#$PP#" \
        -e "s#\${CAPEM}#$CP#" \
        organizations/ccp-template.yaml | sed -e $'s/\\\\n/\\\n          /g'
}

# FarmerOrg
ORG=farmer
ORGMSP=FarmerOrg
P0PORT=7051
CAPORT=7054
PEERPEM=organizations/peerOrganizations/farmer.freshroute.com/tlsca/tlsca.farmer.freshroute.com-cert.pem
CAPEM=organizations/peerOrganizations/farmer.freshroute.com/ca/ca.farmer.freshroute.com-cert.pem

echo "$(json_ccp $ORG $ORGMSP $P0PORT $CAPORT $PEERPEM $CAPEM)" > organizations/peerOrganizations/farmer.freshroute.com/connection-farmer.json
echo "$(yaml_ccp $ORG $ORGMSP $P0PORT $CAPORT $PEERPEM $CAPEM)" > organizations/peerOrganizations/farmer.freshroute.com/connection-farmer.yaml

# BuyerOrg
ORG=buyer
ORGMSP=BuyerOrg
P0PORT=9051
CAPORT=8054
PEERPEM=organizations/peerOrganizations/buyer.freshroute.com/tlsca/tlsca.buyer.freshroute.com-cert.pem
CAPEM=organizations/peerOrganizations/buyer.freshroute.com/ca/ca.buyer.freshroute.com-cert.pem

echo "$(json_ccp $ORG $ORGMSP $P0PORT $CAPORT $PEERPEM $CAPEM)" > organizations/peerOrganizations/buyer.freshroute.com/connection-buyer.json
echo "$(yaml_ccp $ORG $ORGMSP $P0PORT $CAPORT $PEERPEM $CAPEM)" > organizations/peerOrganizations/buyer.freshroute.com/connection-buyer.yaml

# TransporterOrg
ORG=transporter
ORGMSP=TransporterOrg
P0PORT=11051
CAPORT=9054
PEERPEM=organizations/peerOrganizations/transporter.freshroute.com/tlsca/tlsca.transporter.freshroute.com-cert.pem
CAPEM=organizations/peerOrganizations/transporter.freshroute.com/ca/ca.transporter.freshroute.com-cert.pem

echo "$(json_ccp $ORG $ORGMSP $P0PORT $CAPORT $PEERPEM $CAPEM)" > organizations/peerOrganizations/transporter.freshroute.com/connection-transporter.json
echo "$(yaml_ccp $ORG $ORGMSP $P0PORT $CAPORT $PEERPEM $CAPEM)" > organizations/peerOrganizations/transporter.freshroute.com/connection-transporter.yaml
