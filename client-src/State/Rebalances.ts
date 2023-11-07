import { RebalancesInterface, StoreInterface } from './State';
import TransactionContainer from './TransactionContainer';

class Rebalances implements RebalancesInterface {
  transactions: TransactionContainer;

  constructor(store: StoreInterface) {
    this.transactions = new TransactionContainer(store, '/api/v1/rebalances');
  }
}

export default Rebalances;
