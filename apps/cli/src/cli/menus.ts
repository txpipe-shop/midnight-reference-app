const DIVIDER = '──────────────────────────────────────────────────────────────';

export const contractMenu: string = `
${DIVIDER}
  [1] Deploy a new contract
  [2] Join an existing contract
  [3] (Sponsor) Inspect, add only DUST, and submit
  [4] Start ZSwap to request DUST sponsorship
  [5] Get balances
  [6] Exit
${DIVIDER}
`;

export const circuitMenu: string = `
${DIVIDER}
  [1] Get sponsorship state
  [2] (Owner) Pause sponsorship
  [3] (Owner) Resume sponsorship
  [4] (Operator) Verify and enroll signed request
  [5] (Operator) Remove delegator
  [6] (Owner) Rotate eligibility operator
  [7] Exit
${DIVIDER}
`;
