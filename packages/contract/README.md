# Contract package

This package contains the contract itself (in the Compact language) and all the TypeScript code to interact with the contract. Without this package, this monorepo would be pointless and unusable.

Therefore, it is very important that any minor change in the Compact contract is reflected in the rates imported by the package.

## ~~Re~~writing the contract

You will most likely want to edit the vague example contract that this repository has. So, you've probably already modified the `.compact` file and maybe even compiled it. So eventually you'll run into some type errors

To fix this, you will need to update the files in this package:

### **`witnesses.ts`**

If you `.compact` file doesn't declare any witnesses, you can update the `witnesses` object to be an empty object.
If it does, you will need to update the `witnesses` object to include the new witnesses defined in the `.compact` file.
For each witness you will write a function that takes a `WitnessBase` as first argument (named `context`) and then, the arguments of the witness function. The return value should be a tuple of the new private state and the declared return value.

```compact
witness foo(x: Boolean): Boolean;
witness bar(y: Vector<2, Uint<8>>, z: Uint<8>): Uint<1>;
...
```

```ts
export const witnesses = {
  foo: (context: WitnessBase, x: boolean): [PrivateState, boolean] => [
    context.privateState,
    x,
  ],
  bar: (context: WitnessBase, y: string, z: number): [PrivateState, string] => {
    // bar logic here...
    return [context.privateState, 1];
  },
  ...
};
```

### **`types.ts`**

This file contains the core types for the contract.

In general, no changes are necessary, but you can rename the types to better represent your specific use case. For example, `ExampleContractType` -> `ZKLotteryType`.

```ts
// Represents the contract class with its corresponding defined types (private state and witnesses).
export const ExampleContractConstructor = Contract<
  PrivateState,
  Witnesses<PrivateState>
>;
export type ExampleContractType = InstanceType<
  typeof ExampleContractConstructor
>;

// Represents a deployed or a found contract in the blockchain.
// After correctly using `deployContract()` or `findDeployContract()` you will obtain an instance of this type.
export type ExampleContractDeployed =
  | DeployedContract<ExampleContractType>
  | FoundContract<ExampleContractType>;

// Represents the private state key used to store or retrieve the private state in the blockchain.
// TODO: Expand this explanation with more information.
export const exampleContractPrivateStateKey = "exampleContractPrivateState";
export type PrivateStateId = typeof exampleContractPrivateStateKey;

// Represents the exported (impure) circuits of the contract.
export type ExampleContractCircuitKeys = Exclude<
  keyof ExampleContractType["impureCircuits"],
  number | symbol
>;

// Represents the providers for the contract.
// Providers are the objects that are used to interact with the contract. You can find more information in the `midnight-js-types` package (MidnightProviders interface)
export type ExampleContractProviders = ContractProviders<ExampleContractType>;
```

### **`private-state.ts`**

This file contains the definition of the private state for the contract. You will need to keep the `PrivateState` type updated and, if necessary, the `createPrivateState` function.

Each contract has a different set of private states, or even none at all. So it depends on each use case.

### **`providers.ts`**

In most cases you will not need to update this file, only if you decide to change the names of the types defined in the other files.

### **`index.ts`**

Here we can find a `tag` constant that represents a unique identifier for this type of contract. This constant can be changed without any problem

We also find `CompactCompiledContract` which is the pre compiled contract necessary when deploying or finding a contract on the blockchain. Again, we can update the names.

If our contract does not include witnesses, we can substitute

```ts
export const CompactCompiledContract =
  CompiledContract.make<ExampleContractType>(
    tag,
    ExampleContractConstructor
  ).pipe(
    CompiledContract.withWitnesses(witnesses),
    CompiledContract.withCompiledFileAssets(contractConfig.zkConfigPath)
  );
```

with

```ts
export const CompactCompiledContract =
  CompiledContract.make<ExampleContractType>(
    tag,
    ExampleContractConstructor
  ).pipe(
    CompiledContract.withVacantWitnesses,
    CompiledContract.withCompiledFileAssets(contractConfig.zkConfigPath)
  );
```
