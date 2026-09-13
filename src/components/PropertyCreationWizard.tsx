import React from 'react';
import { PropertySetupWizard, WizardProperty } from './PropertySetupWizard';

export type { WizardProperty };

export interface PropertyCreationWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  tenantId: number;
  remainingSlots: number;
  existingProperty?: WizardProperty | null;
}

/**
 * PropertyCreationWizard:
 * Delegating adapter to the unified PropertySetupWizard with mode="create".
 * Follows the Single Source of Truth rule so property creation and setup onboarding
 * share identical step forms, validation, and Airbnb import logic without code drift.
 */
export const PropertyCreationWizard: React.FC<PropertyCreationWizardProps> = (props) => {
  return <PropertySetupWizard mode="create" {...props} />;
};
