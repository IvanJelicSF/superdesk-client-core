import React from 'react';
import PropTypes from 'prop-types';
import {ItemContainer} from 'apps/contacts/components';

export const Mobile: React.FunctionComponent<any> = ({item}) =>
    <ItemContainer key="mobile" field="mobile" item={item} />;

Mobile.propTypes = {
    item: PropTypes.object,
};
