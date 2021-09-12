import { makeAutoObservable, runInAction } from 'mobx';
import Category, { isCategory } from './Category';
import {
  Error, GroupProps, isErrorResponse, isGroupProps,
  CategoryBalanceProps,
  CategoryProps,
} from '../../common/ResponseTypes';
import {
  getBody, httpDelete, httpPatch,
} from './Transports';
import { CategoryInterface, GroupInterface, StoreInterface } from './State';

class Group implements GroupInterface {
  id: number;

  name: string;

  type: string;

  categories: CategoryInterface[] = [];

  store: StoreInterface;

  constructor(props: GroupProps | Group, store: StoreInterface) {
    this.id = props.id;
    this.name = props.name;
    this.type = props.type;
    this.store = store;

    if (props.categories && props.categories.length > 0) {
      this.setCategories(props.categories);
    }

    makeAutoObservable(this);
  }

  setCategories(categories: Category[] | CategoryProps[]): void {
    categories.forEach((c) => {
      switch (c.type) {
        case 'UNASSIGNED':
          if (this.store.categoryTree.unassignedCat === null) {
            throw new Error('category is null');
          }
          this.categories.push(this.store.categoryTree.unassignedCat);
          break;

        case 'ACCOUNT TRANSFER':
          if (this.store.categoryTree.accountTransferCat === null) {
            throw new Error('category is null');
          }
          this.categories.push(this.store.categoryTree.accountTransferCat);
          break;

        case 'FUNDING POOL':
          if (this.store.categoryTree.fundingPoolCat === null) {
            throw new Error('category is null');
          }
          this.categories.push(this.store.categoryTree.fundingPoolCat);
          break;

        default: {
          const category = new Category(c, this.store);
          this.categories.push(category);
          break;
        }
      }
    });
  }

  findCategory(categoryId: number): CategoryInterface | null {
    const cat = this.categories.find((c) => c.id === categoryId);

    if (cat) {
      return cat;
    }

    return null;
  }

  insertCategory(category: CategoryInterface): void {
    // Find the position where this new category should be inserted.
    const index = this.categories.findIndex((g) => category.name.localeCompare(g.name) < 0);

    if (index === -1) {
      this.categories.push(category);
    }
    else {
      this.categories = [
        ...this.categories.slice(0, index),
        category,
        ...this.categories.slice(index),
      ];
    }
  }

  async update(name: string): Promise<null | Error[]> {
    const response = await httpPatch(`/api/groups/${this.id}`, { name });

    const body = await getBody(response);

    if (!response.ok) {
      if (isErrorResponse(body)) {
        return body.errors;
      }
    }
    else {
      runInAction(() => {
        if (isGroupProps(body)) {
          this.name = body.name;
        }
      });
    }

    return null;
  }

  async delete (): Promise<null | Error[]> {
    const response = await httpDelete(`/api/groups/${this.id}`);

    if (!response.ok) {
      const body = await getBody(response);

      if (isErrorResponse(body)) {
        return body.errors;
      }
    }
    else {
      runInAction(() => {
        this.store.categoryTree.removeNode(this);
      });
    }

    return null;
  }

  removeCategory(category: CategoryInterface): void {
    const index = this.categories.findIndex((c) => c.id === category.id);
    if (index !== -1) {
      this.categories.splice(index, 1);
    }
  }

  updateBalances(balances: CategoryBalanceProps[]): void {
    this.categories.forEach((c) => {
      c.updateBalances(balances);
    });
  }
}

export const isGroup = (r: unknown): r is Group => (
  r !== undefined && r !== null
  && (r as Group).id !== undefined
  && (r as Group).name !== undefined
  && (r as Group).categories !== undefined
);

export const isCategoriesArray = (r: unknown): r is Category[] => (
  (Array.isArray(r))
  && (r.length === 0 || isCategory((r as Category[])[0]))
);

export default Group;
