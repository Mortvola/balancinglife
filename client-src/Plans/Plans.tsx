import React, { useContext, useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import PlanDetails from './PlanDetails';
import MobxStore from '../State/mobxStore';
import PlanList from './PlanList';
import PlansToolbar from './PlansToolbar';
import Main from '../Main';
import useMediaQuery from '../MediaQuery'
import styles from './Plans.module.css'
import { CategoryInterface } from '../State/State';
import { useEditCategoryDialog } from './EditCategoryDialog';
import FundingPlanCategory from '../State/FundingPlanCategory';

const Plans = () => {
  const { plans, uiState } = useContext(MobxStore);
  const [open, setOpen] = useState<boolean>(false);
  const { isMobile } = useMediaQuery();
  const [EditCategoryDialog, showEditCategoryDialog] = useEditCategoryDialog();
  const [category, setCategory] = useState<{
    category: CategoryInterface | undefined,
    planCategory: FundingPlanCategory | undefined,
  }>({
    category: undefined,
    planCategory: undefined,
  });

  useEffect(() => {
    plans.load();
  }, [plans]);

  useEffect(() => {
    if (uiState.selectedPlan !== null) {
      plans.loadDetails(uiState.selectedPlan);
    }
  }, [plans, uiState.selectedPlan]);

  const handleSelect = () => {
    if (isMobile) {
      setOpen(false);
    }
  };

  const handleToggleClick = () => {
    setOpen(!open);
  }

  const handleEditCategory = (cat: CategoryInterface, planCategory: FundingPlanCategory) => {
    setCategory({ category: cat, planCategory });
    showEditCategoryDialog();
  }

  return (
    <Main
      open={open}
      toolbar={<PlansToolbar />}
      sidebar={<PlanList plans={plans.list} selected={uiState.selectedPlan} onSelect={handleSelect} />}
      onToggleClick={handleToggleClick}
      className={styles.theme}
    >
      <PlanDetails onEditCategory={handleEditCategory} />
      <EditCategoryDialog
        plan={uiState.selectedPlan}
        category={category.category}
        planCategory={category.planCategory}
      />
    </Main>
  );
};

export default observer(Plans);
